import "dotenv/config";

import type { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import { actor } from "./actor.ts";
import { agent } from "./agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

await actor.mutuals.load();

const knownAccounts = new Set([agent.did!]);

for (const { did } of actor.follows.list) knownAccounts.add(did);
for (const { did } of actor.followers.list) knownAccounts.add(did);

let cursor: string | undefined;
let count = 0;
const cutoff = new Date();

cutoff.setUTCDate(cutoff.getUTCDate() - 15);

do {
  const { data } = await agent.getActorLikes({
    actor: agent.did!,
    cursor,
    limit: 100,
  });

  if (data.feed.length === 0) {
    break;
  }

  for (const { post, reply } of data.feed) {
    if (!post.viewer?.like) {
      continue;
    }

    // ignore recent likes
    if (new Date(post.indexedAt) > cutoff) {
      continue;
    }

    // don't delete likes on known accounts
    if (knownAccounts.has(post.author.did)) {
      continue;
    }

    // don't delete likes in the replies of threads from known accounts
    if (reply) {
      if (
        reply.root.$type === "app.bsky.feed.defs#postView" &&
        knownAccounts.has((reply.root as PostView).author.did)
      ) {
        continue;
      }

      if (
        reply.parent.$type === "app.bsky.feed.defs#postView" &&
        knownAccounts.has((reply.parent as PostView).author.did)
      ) {
        continue;
      }

      if (
        reply.grandparentAuthor &&
        knownAccounts.has(reply.grandparentAuthor.did)
      ) {
        continue;
      }
    }

    console.log(
      `Removing like on post by ${post.author.displayName} ${post.author.handle}…`,
    );

    await agent.deleteLike(post.viewer!.like!);
  }

  count += data.feed.length;
  console.log(`Processed ${count} posts…`);
  cursor = data.cursor;
} while (cursor);
