import type { AppBskyFeedPost } from "@atproto/api";
import { agent } from "./agent.ts";

const DRY_RUN = process.env.CONFIRM !== "y";

export async function waitShort() {
  const delay = 1 + 4 * Math.random();

  console.log(`Waiting ${delay.toFixed(1)} mins…`);

  if (DRY_RUN) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, delay * 60_000));
}

interface PostInfo {
  uri: string;
  cid: string;
}

class Post implements PostInfo {
  readonly uri: string;
  readonly cid: string;
  #root: Post;

  constructor(post: PostInfo) {
    this.uri = post.uri;
    this.cid = post.cid;
    this.#root = this;
  }

  async reply(
    contents: string | Partial<AppBskyFeedPost.Record>,
  ): Promise<Post> {
    const record = toRecord(contents);

    record.reply = {
      root: { uri: this.#root.uri, cid: this.#root.cid },
      parent: { uri: this.uri, cid: this.cid },
    };

    const post = await createPost(record);
    post.#root = this.#root;
    return post;
  }
}

export async function createPost(
  content: string | Partial<AppBskyFeedPost.Record>,
): Promise<Post> {
  const record = toRecord(content);

  record.langs ??= ["en"];

  console.log(`Posting ${JSON.stringify(record)}…`);

  if (DRY_RUN) {
    return new Post({ cid: "cid", uri: "uri" });
  }

  const info = await agent.post(record);

  return new Post(info);
}

function toRecord(
  from: string | Partial<AppBskyFeedPost.Record>,
): Partial<AppBskyFeedPost.Record> {
  return typeof from === "string" ? { text: from } : from;
}
