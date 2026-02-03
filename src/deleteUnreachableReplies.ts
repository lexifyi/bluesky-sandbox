import "dotenv/config";

import { agent } from "./agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

let cursor: string | undefined;
let count = 0;

do {
  const { data } = await agent.getAuthorFeed({
    actor: agent.did!,
    cursor,
    includePins: false,
    limit: 100,
    filter: "posts_with_replies",
  });

  for (const { post, reply } of data.feed) {
    if (reply && reply.root.$type !== "app.bsky.feed.defs#postView") {
      await agent.deletePost(post.uri);
      console.log(`Deleted ${post.cid}`);
    }
  }

  count += data.feed.length;
  console.log(`Processed ${count} posts…`);
  cursor = data.cursor;
} while (cursor);
