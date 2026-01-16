import "dotenv/config";

import { Jetstream } from "@skyware/jetstream";
import express from "express";
import morgan from "morgan";
import { actor } from "./actor.ts";
import { agent } from "./agent.ts";
import { listMaybeFollows } from "./maybeFollows.ts";

console.log("Logging in…");

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

interface FeedEntry {
  uri: string;
  time: number;
}

let posts: FeedEntry[] = [];

console.log("Loading followers…");

await actor.follows.load();

console.log("Getting list of maybe follows…");

const wantedDids = await listMaybeFollows();
const allowedDids = new Set(wantedDids);

for (const follow of actor.follows.list) {
  allowedDids.add(follow.did);
}

const jetstream = new Jetstream({
  wantedDids,
});

jetstream.onCreate("app.bsky.feed.post", (ev) => {
  const uri = `at://${ev.did}/${ev.commit.collection}/${ev.commit.rkey}`;
  const time = ev.time_us;

  if (ev.commit.record.reply?.root) {
    const did = new URL(ev.commit.record.reply.root.uri).hostname;

    if (!allowedDids.has(did)) {
      console.log(`skipped reply ${uri} to ${did}'s thread`);
      return;
    }
  }

  console.log(`added ${uri}`);
  posts.push({ uri, time });
  posts.sort((a, b) => b.time - a.time);
  posts.length = Math.min(posts.length, 100);
});

jetstream.onDelete("app.bsky.feed.post", (ev) => {
  const uri = `at://${ev.did}/${ev.commit.collection}/${ev.commit.rkey}`;

  for (let i = posts.length - 1; i >= 0; i--) {
    if (posts[i].uri === uri) {
      posts.splice(i, 1);
    }
  }
});

const FEED_GENERATOR_DID = "did:web:bsky.lexi.fyi";
const FEED_GENERATOR_ENDPOINT = "https://bsky.lexi.fyi";
const FEED_GENERATOR_URI =
  "at://did:plc:ijjndvwrk7qwasgrvgujlnrm/app.bsky.feed.generator/hello-world";

const app = express();
const port = 9396;

app.use(morgan("dev"));

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
    feed: posts[Symbol.iterator]()
      .take(limit)
      .map((p) => ({ post: p.uri }))
      .toArray(),
  });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
  jetstream.start();
  console.log("Jetstream started.");
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
    Buffer.from(claimsB64, "base64url").toString("utf8")
  );

  if (typeof claims !== "object" || !("iss" in claims)) {
    return false;
  }

  return claims.iss === agent.did;
}
