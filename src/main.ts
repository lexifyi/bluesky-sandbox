import "dotenv/config";

import { AtpAgent } from "@atproto/api";

const agent = new AtpAgent({
  service: "https://bsky.social",
});

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

interface Follower {
  did: string;
  handle: string;
}

let cursor: string | undefined;
const followers = new Map<string, Follower>();

while (true) {
  const res = await agent.getFollows({
    actor: agent.did!,
    limit: 100,
    cursor,
  });

  if (!res.success) {
    console.error("some kind of error");
    break;
  }

  for (const { handle, did } of res.data.follows) {
    followers.set(did, { did, handle });
  }

  cursor = res.data.cursor;

  if (!cursor) {
    break;
  }
}

interface Entry {
  did: string;
  handle: string;
  count: number;
}

const entries = new Map<string, Entry>();
const cutoff = new Date();

cutoff.setMonth(cutoff.getMonth() - 2);
cursor = undefined;

for (const { did, handle } of followers.values()) {
  entries.set(did, { did, handle, count: 0 });
}

while (true) {
  const res = await agent.getActorLikes({
    actor: agent.did!,
    limit: 100,
    cursor,
  });

  if (!res.success) {
    console.error("some kind of error");
    break;
  }

  let newest = new Date(0);

  for (const { post, reason } of res.data.feed) {
    if (reason) {
      console.dir(reason);
    }
    const { did, handle } = post.author;
    let entry = entries.get(did);

    const indexedAt = new Date(post.indexedAt);

    if (indexedAt.valueOf() > newest.valueOf()) {
      newest = indexedAt;
    }

    if (!entry) {
      entries.set(did, (entry = { did, handle, count: 0 }));
    }

    entry.count++;
  }

  cursor = res.data.cursor;

  if (!cursor || newest.valueOf() < cutoff.valueOf()) {
    break;
  }
}

const sorted = entries
  .values()
  //.filter((e) => e.count < 6)
  //.filter((e) => !followers.has(e.did))
  .filter((e) => followers.has(e.did))
  .toArray();

sorted.sort((a, b) => a.count - b.count);

for (let i = 0; i < sorted.length && i < 25; i++) {
  const { handle, count } = sorted[i];

  console.log(`${i + 1}. ${handle} (${count})`);
}
