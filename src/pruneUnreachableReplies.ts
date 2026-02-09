import "dotenv/config";

import { agent } from "./lib/agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

let cursor: string | undefined;
let count = 0;
const cutoff = new Date();

cutoff.setUTCDate(cutoff.getUTCDate() - 15);

do {
  const { data } = await agent.getAuthorFeed({
    actor: agent.did!,
    cursor,
    includePins: false,
    limit: 100,
    filter: "posts_with_replies",
  });

  if (data.feed.length === 0) {
    break;
  }

  for (const { post, reply } of data.feed) {
    if (!reply || new Date(post.indexedAt) > cutoff) {
      continue;
    }

    if (
      reply.root.$type !== "app.bsky.feed.defs#postView" ||
      reply.parent.$type !== "app.bsky.feed.defs#postView"
    ) {
      console.log(`Deletìng reply ${JSON.stringify(post.record.text)}`);
      await agent.deletePost(post.uri);
    }
  }

  count += data.feed.length;
  console.log(`Processed ${count} posts…`);
  cursor = data.cursor;
} while (cursor);
