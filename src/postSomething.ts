const DRY_RUN = process.env.CONFIRM !== "y";

// if (Math.random() < 0.3) {
//   console.log("nah, i'm good");
//   process.exit();
// }

import "dotenv/config";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { agent } from "./lib/agent.ts";

async function run() {
  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER || "",
    password: process.env.BSKY_PASSWORD || "",
  });

  interface PostModule {
    path: string;
    module: {
      shouldPublish?: () => boolean;
      publish: () => Promise<void>;
    };
  }

  const dirname = path.join(import.meta.dirname, "posts");
  const files = await readdir(dirname);

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
    ({ module }) => !module.shouldPublish || module.shouldPublish(),
  );

  const selected = ready[Math.floor(Math.random() * ready.length)];

  if (!selected) {
    console.log("nothing to post");
  }

  await selected.module.publish();

  if (DRY_RUN) {
    console.log(`rm ${selected.path}`);
  } else {
    await rm(selected.path);
  }
}

run().catch(console.error);
