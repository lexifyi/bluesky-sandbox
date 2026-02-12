import type { AppBskyFeedPost } from "@atproto/api";
import { agent } from "./agent.ts";

const DRY_RUN = process.env.CONFIRM !== "y";
export const POSTING_HOURS = new Set([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
]);

export function isPostingHour(now: Date) {
  return POSTING_HOURS.has(now.getHours());
}

export function isMorning(now: Date) {
  const hours = now.getHours();
  return hours >= 10 && hours < 12;
}

export function isDay(now: Date) {
  const hours = now.getHours();
  return hours >= 12 && hours < 17;
}

export function isEvening(now: Date) {
  const hours = now.getHours();
  return hours >= 17 && hours < 20;
}

export function isNight(now: Date) {
  const hours = now.getHours();
  return hours >= 19 && hours < 22;
}

export function isNormalTime(now: Date) {
  const hours = now.getHours();
  return hours >= 11 && hours < 18;
}

export function isNormalNonWorkTime(now: Date) {
  return isWeekend(now) ? isNormalTime(now) : isEvening(now);
}

export function isWeekend(now: Date) {
  return now.getDay() >= 5;
}

export async function waitShort() {
  return waitMinutes(1, 5);
}

export async function waitMinutes(min: number, max: number) {
  const delay = min + (max - min) * Math.random();

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
