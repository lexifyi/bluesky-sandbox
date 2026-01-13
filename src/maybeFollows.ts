import { actor } from "./actor.ts";
import { agent } from "./agent.ts";

export async function listMaybeFollows() {
  interface Entry {
    did: string;
    handle: string;
    count: number;
  }

  const entries = new Map<string, Entry>();
  const cutoff = new Date();

  cutoff.setMonth(cutoff.getMonth() - 2);

  for (const { did, handle } of actor.follows.list) {
    entries.set(did, { did, handle, count: 0 });
  }

  let cursor: string | undefined;

  do {
    const res = await agent.getActorLikes({
      actor: agent.did!,
      limit: 100,
      cursor,
    });

    let newest = cutoff;

    for (const { post } of res.data.feed) {
      const { did, handle } = post.author;
      let entry = entries.get(did);

      const indexedAt = new Date(post.indexedAt);

      if (indexedAt > newest) {
        newest = indexedAt;
      }

      if (!entry) {
        entries.set(did, (entry = { did, handle, count: 0 }));
      }

      entry.count++;
    }

    if (newest <= cutoff) {
      break;
    }

    cursor = res.data.cursor;
  } while (cursor);

  const sorted = entries
    .values()
    .filter((e) => e.count > 2)
    .filter((e) => !actor.follows.containsDID(e.did))
    .toArray();

  sorted.sort((a, b) => b.count - a.count);

  return sorted.map((e) => e.did);
}
