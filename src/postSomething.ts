import "dotenv/config";

import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { agent } from "./lib/agent.ts";
import { isPostingHour, POSTING_HOURS, waitMinutes } from "./lib/functions.ts";

const DRY_RUN = process.env.CONFIRM !== "y";
const FORCE = process.env.FORCE === "y";

interface PostModule {
  path: string;
  module: {
    shouldPublish?: (now: Date) => boolean;
    publish: () => Promise<void>;
  };
}

async function run() {
  if (process.env.WAIT === "y") {
    await waitMinutes(0, 60);
  }

  const now = new Date();

  if (!FORCE && !isPostingHour(now)) {
    console.log("bad time");
    return;
  }

  const dirname = path.join(import.meta.dirname, "posts");
  const files = await readdir(dirname);

  if (!FORCE && Math.random() >= files.length / 7 / POSTING_HOURS.size) {
    console.log("nah, i'm good");
    return;
  }

  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER || "",
    password: process.env.BSKY_PASSWORD || "",
  });

  if (typeof process.argv[2] === "string") {
    const filename = path.resolve(process.argv[2]);
    const module = await import(filename);

    return await publish({ path: filename, module });
  }

  const drafts: PostModule[] = await Promise.all(
    files.map(async (f) => {
      const abs = path.join(dirname, f);

      return {
        path: abs,
        module: await import(abs),
      };
    }),
  );

  const ready = drafts.filter(
    ({ module }) => !module.shouldPublish || module.shouldPublish(now),
  );

  if (!FORCE && Math.random() * ready.length < 1) {
    console.log("running low on drafts tbh");
    return;
  }

  const selected = ready[Math.floor(Math.random() * ready.length)];

  if (selected) {
    await publish(selected);
  } else {
    console.log("nothing to post atm");
  }
}

async function publish({ path, module }: PostModule) {
  await module.publish();

  if (DRY_RUN) {
    console.log(`rm ${path}`);
  } else {
    await rm(path);
  }
}

run().catch(console.error);
