import "dotenv/config";

import { Jetstream } from "@skyware/jetstream";
import express from "express";
import morgan from "morgan";
import { agent } from "./lib/agent.ts";

interface FeedEntry {
  uri: string;
  time: number;
}

let posts: FeedEntry[] = [];

const wantedDids = [
  "did:plc:4kq7btfhe2trctdusevisyxl",
  "did:plc:d5vcfslnbof6iscg6bkioloa",
  "did:plc:qhdklf2jclke2fboszi72v2u",
  "did:plc:nzdohiyi6kj7z4cenc75h7sd",
  "did:plc:tfpssovy4db6fmvschveeyzb",
  "did:plc:s7im66dmkz46mgisxpf5vlas",
  "did:plc:ks5e3y523ywku5rmivnpbj4y",
  "did:plc:f7tzucxlil2hedwqswlrwit3",
  "did:plc:reo7ah66nruqpfb3expeqsfk",
  "did:plc:2hdfgg2dq3uvkgga2em74fma",
  "did:plc:7r46wb2sdsmtieu7asxr2rsp",
  "did:plc:kxtykpybx2osastkudntrj6v",
];
const allowedDids = new Set(wantedDids);

const jetstream = new Jetstream({
  wantedDids,
});

jetstream.onCreate("app.bsky.feed.post", (ev) => {
  const uri = `at://${ev.did}/${ev.commit.collection}/${ev.commit.rkey}`;
  const time = ev.time_us;

  // if (ev.commit.record.reply?.root) {
  //   const did = new URL(ev.commit.record.reply.root.uri).hostname;

  //   if (!allowedDids.has(did)) {
  //     console.log(`skipped reply ${uri} to ${did}'s thread`);
  //     return;
  //   }
  // }

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
    Buffer.from(claimsB64, "base64url").toString("utf8"),
  );

  if (typeof claims !== "object" || !("iss" in claims)) {
    return false;
  }

  return claims.iss === agent.did;
}
