import "dotenv/config";

import { AtpAgent } from "@atproto/api";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.resolve(import.meta.dirname, "../../session.json");

export const agent = new AtpAgent({
  service: "https://bsky.social",
  persistSession: (evt, session) => {
    writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  },
});

try {
  const sessionData = JSON.parse(readFileSync(sessionFile, "utf8"));

  await agent.resumeSession(sessionData);
} catch {
  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER || "",
    password: process.env.BSKY_PASSWORD || "",
  });
}
