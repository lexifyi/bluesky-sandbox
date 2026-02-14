import "dotenv/config";

import {
  isReasonRepost,
  type FeedViewPost,
  type SkeletonFeedPost,
} from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import express from "express";
import morgan from "morgan";
import { actor } from "./lib/actor.ts";
import { agent } from "./lib/agent.ts";

/** Six hours. */
const DECAY_PERIOD = 6 * 60 * 60 * 1000;

const seen = new Set<string>();
let sorted: Array<{ score: number; post: FeedViewPost }> = [];

async function refresh() {
  console.log("Refreshing posts…");

  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER || "",
    password: process.env.BSKY_PASSWORD || "",
  });

  await actor.mutuals.load();

  const posts: FeedViewPost[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 15; page++) {
    const { data } = await agent.getTimeline({
      cursor,
      limit: 100,
    });

    console.log(".");

    for (const post of data.feed) {
      if (
        post.post.author.did === agent.did ||
        post.post.viewer?.like ||
        post.post.viewer?.repost
      ) {
        continue;
      }

      if (post.reply && (post.post.likeCount ?? 0) < 5) {
        continue;
      }

      posts.push(post);
    }

    cursor = data.cursor;

    if (!cursor) break;
  }

  const now = new Date();

  sorted = posts.map((post) => ({
    score: scoreOfPost(now, post),
    post,
  }));

  sorted.sort((a, b) => b.score - a.score);

  setTimeout(refresh, 15 * 60 * 1000);
}

await refresh();

function scoreOfPost(now: Date, { post, reason }: FeedViewPost): number {
  let score = Math.sqrt((post.likeCount ?? 0) + 5);

  const indexedAt = new Date(
    isReasonRepost(reason) ? reason.indexedAt : post.indexedAt,
  );

  const age = now.valueOf() - indexedAt.valueOf();

  if (!actor.follows.containsDID(post.author.did)) {
    score = Math.sqrt(score);
  }

  return score / Math.pow(2, age / DECAY_PERIOD);
}

const FEED_GENERATOR_DID = "did:web:bsky.lexi.fyi";
const FEED_GENERATOR_ENDPOINT = "https://bsky.lexi.fyi";
const FEED_GENERATOR_URI =
  "at://did:plc:ijjndvwrk7qwasgrvgujlnrm/app.bsky.feed.generator/hello-world";

const app = express();
const port = 9396;

app.use(morgan("dev"));
app.use(express.json());

app.get("/.well-known/did.json", (req, res) => {
  res.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: FEED_GENERATOR_DID,
    service: [
      {
        id: "#bsky_fg",
        serviceEndpoint: FEED_GENERATOR_ENDPOINT,
        type: "BskyFeedGenerator",
      },
    ],
  });
});

app.get("/xrpc/app.bsky.feed.describeFeedGenerator", (req, res) => {
  res.json({
    did: FEED_GENERATOR_DID,
    feeds: [
      {
        uri: FEED_GENERATOR_URI,
      },
    ],
  });
});

app.get("/xrpc/app.bsky.feed.getFeedSkeleton", (req, res) => {
  if (!isAuthorized(req)) {
    res.sendStatus(403);
    return;
  }

  const limit =
    typeof req.query.limit === "string" ? parseInt(req.query.limit) : 50;

  res.json({
    feed: sorted
      .values()
      .filter(({ post: { post } }) => !seen.has(post.uri))
      .take(limit)
      .map(({ post }) => {
        const item: SkeletonFeedPost = {
          post: post.post.uri,
        };

        if (isReasonRepost(post.reason)) {
          item.reason = {
            $type: "app.bsky.feed.defs#skeletonReasonRepost",
            repost: post.reason.uri!,
          };
        }

        return item;
      })
      .toArray(),
  });
});

app.post("/xrpc/app.bsky.feed.sendInteractions", (req, res) => {
  if (!isAuthorized(req)) {
    res.sendStatus(403);
    return;
  }

  const json = req.body;

  for (const { item } of json.interactions) {
    seen.add(item);
  }

  res.json({});
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

function isAuthorized(req: express.Request): boolean {
  const auth = req.header("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return false;
  }

  const [_headerB64, claimsB64, _sigB64] = auth
    .slice("Bearer ".length)
    .split(".");

  if (!claimsB64) {
    return false;
  }

  const claims = JSON.parse(
    Buffer.from(claimsB64, "base64url").toString("utf8"),
  );

  if (typeof claims !== "object" || !("iss" in claims)) {
    return false;
  }

  return claims.iss === agent.did;
}
