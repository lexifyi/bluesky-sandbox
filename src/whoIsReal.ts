import "dotenv/config";

import { actor } from "./actor.ts";
import { agent } from "./agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

await actor.mutuals.load();

const map = new Map<string, number>();

for (const mutual of actor.mutuals) {
  map.set(mutual.did, 0);
}

let limit = 50;
let cursor: string | undefined;

do {
  const { data: posts } = await agent.getAuthorFeed({
    actor: agent.did!,
    cursor,
    filter: "posts_no_replies",
  });

  for (const { post } of posts.feed) {
    const { data: likes } = await agent.getLikes({ uri: post.uri });

    console.log(".");

    for (const like of likes.likes) {
      const entry = map.get(like.actor.did) ?? 0;

      map.set(like.actor.did, entry + 1);
    }

    limit--;

    if (limit === 0) break;
  }

  if (limit === 0) break;

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

  if (count > 0 && !actor.follows.containsDID(follower.did)) {
    console.log(`Add? ${follower.displayName} @${follower.handle} x${count}`);
  }
}
