import "dotenv/config";

import { ids } from "@atproto/api/dist/client/lexicons.js";
import { agent } from "./lib/agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

await agent.com.atproto.repo.putRecord({
  repo: agent.did!,
  collection: ids.AppBskyFeedGenerator,
  rkey: "hello-world",
  record: {
    acceptsInteractions: true,
    did: "did:web:bsky.lexi.fyi",
    displayName: "Hello World",
    description: "Test feed please ignore.",
    createdAt: new Date().toISOString(),
  },
});
