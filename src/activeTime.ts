import "dotenv/config";

import { Jetstream } from "@skyware/jetstream";
import * as fs from "node:fs/promises";
import { actor } from "./actor.ts";
import { agent } from "./agent.ts";

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER || "",
  password: process.env.BSKY_PASSWORD || "",
});

await actor.mutuals.load();

const jetstream = new Jetstream({
  wantedDids: actor.mutuals[Symbol.iterator]()
    .map((m) => m.did)
    .toArray(),
  wantedCollections: ["app.bsky.feed.like"],
});

const activeTimes: number[] = [];
const aggregatedTimes: Array<[Date, number]> = [];
let aggregator: NodeJS.Timeout | undefined;

const log = await fs.open("active.bin", "as");
const timeBuf = Buffer.alloc(8);

jetstream.onCreate("app.bsky.feed.like", async ({ time_us }) => {
  // if you're reading this, please do note that i am not recording each
  // PERSON'S active time, only all mutuals' COLLECTIVE active time

  activeTimes.push(time_us);

  aggregator ??= setTimeout(() => {
    aggregator = undefined;

    const time = new Date(activeTimes[0] / 1000);
    const count = activeTimes.length;

    activeTimes.length = 0;
    aggregatedTimes.push([new Date(activeTimes[0] / 1000), activeTimes.length]);

    console.log(`${time.toJSON()} ${count.toFixed()}`);
  }, 900000 /* 15 minutes */);

  // log each individual time in binary in case i wanna do like a cool scatter
  // plot or something

  timeBuf.writeDoubleBE(time_us, 0);
  await log.write(timeBuf);
});

jetstream.start();
