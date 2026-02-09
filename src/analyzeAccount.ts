import "dotenv/config";

import type {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
} from "@atproto/api";
import type { ViewRecord } from "@atproto/api/dist/client/types/app/bsky/embed/record.js";
import type {
  PostView,
  ReasonRepost,
} from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import { agent } from "./lib/agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

let handle = process.argv[2];

if (!handle.includes(".")) {
  handle += ".bsky.social";
}

const {
  data: { did },
} = await agent.resolveHandle({
  handle,
});

let cursor: string | undefined;
const cutoff = new Date();

cutoff.setUTCDate(cutoff.getUTCDate() - 15);

const posts: PostView[] = [];
let repostCount = 0;

pagination: do {
  const { data } = await agent.getAuthorFeed({
    actor: did,
    filter: "posts_and_author_threads",
    includePins: false,
    limit: 100,
    cursor,
  });

  for (const { post, reply, reason } of data.feed) {
    if (reason?.$type === "app.bsky.feed.defs#reasonRepost") {
      if (new Date((reason as ReasonRepost).indexedAt) < cutoff) {
        break pagination;
      }

      // if (post.author.did === did && new Date(post.indexedAt) >= cutoff) {
      //   posts.push(post);
      // }

      repostCount++;
    } else {
      if (new Date(post.indexedAt) < cutoff) {
        break pagination;
      }

      posts.push(post);
    }
  }

  cursor = data.cursor;
} while (cursor);

console.log(`Posts per day: ${(posts.length / 15).toPrecision(3)}`);
console.log(`Reposts per day: ${(repostCount / 15).toPrecision(3)}`);

posts.sort((a, b) => scorePost(b) - scorePost(a));

for (let i = 0; i < Math.min(5, posts.length); i++) {
  const { record, embed, likeCount, replyCount, repostCount } = posts[i];
  let text = record.text;

  if (embed) {
    if (embed.$type === "app.bsky.embed.images#view") {
      text = `${text}\n>> ${(embed as AppBskyEmbedImages.View).images.map((i) => i.fullsize).join(", ")}`;
    } else if (embed.$type === "app.bsky.embed.video#view") {
      text = `🎥 ${text}`;
    } else if (embed.$type === "app.bsky.embed.record#view") {
      const embedded = (embed as AppBskyEmbedRecord.View).record;

      if (embedded.$type === "app.bsky.embed.record#viewRecord") {
        text = `${text}\n>> ${(embedded as ViewRecord).value.text}`;
      } else {
        text = `${text}\n>> ${embedded.$type}`;
      }
    } else if (embed.$type === "app.bsky.embed.external#view") {
      text = `${text}\n>> ${(embed as AppBskyEmbedExternal.View).external.uri}`;
    } else {
      text = `${text}\n>> ${embed.$type}`;
    }
  }

  console.log(`\n${text}\n💬 ${replyCount} 🔁 ${repostCount} ❤︎ ${likeCount}`);
}

function scorePost(post: PostView): number {
  return (
    (post.likeCount ?? 0) +
    (post.repostCount ?? 0) * 2 +
    (post.replyCount ?? 0) * 3
  );
}
