import "dotenv/config";

import { actor } from "./lib/actor.ts";
import { agent } from "./lib/agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

await actor.mutuals.load();

const map = new Map<string, number>();

for (const mutual of actor.mutuals) {
  map.set(mutual.did, 0);
}

let cursor: string | undefined;
const cutoff = new Date();

cutoff.setDate(cutoff.getDate() - 15);

pagination: do {
  const { data: posts } = await agent.getAuthorFeed({
    actor: agent.did!,
    cursor,
    filter: "posts_with_replies",
    includePins: false,
  });

  for (const { post, reason } of posts.feed) {
    if (reason) {
      continue;
    }

    if (new Date(post.indexedAt) < cutoff) {
      break pagination;
    }

    const { data: likes } = await agent.getLikes({ uri: post.uri });

    console.log(".");

    for (const like of likes.likes) {
      const entry = map.get(like.actor.did) ?? 0;

      map.set(like.actor.did, entry + 1);
    }
  }

  cursor = posts.cursor;
} while (cursor);

for (const mutual of actor.mutuals) {
  const count = map.get(mutual.did) ?? 0;

  if (count === 0) {
    console.log(`Remove? ${mutual.displayName} @${mutual.handle} x${count}`);
  }
}

for (const follower of actor.followers.list) {
  const count = map.get(follower.did) ?? 0;

  if (count > 1 && !actor.follows.containsDID(follower.did)) {
    console.log(`Add? ${follower.displayName} @${follower.handle} x${count}`);
  }
}
