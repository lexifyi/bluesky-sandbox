import type { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { agent } from "./agent.ts";

const followDIDs = new Set<string>();
const followsList: ProfileView[] = [];

const followerDIDs = new Set<string>();
const followersList: ProfileView[] = [];

export const actor = {
  mutuals: {
    async load() {
      return Promise.all([actor.follows.load(), actor.followers.load()]);
    },

    containsDID(did: string): boolean {
      return actor.follows.containsDID(did) && actor.followers.containsDID(did);
    },

    [Symbol.iterator](): Iterator<ProfileView> {
      return followsList[Symbol.iterator]().filter((f) =>
        actor.followers.containsDID(f.did)
      );
    },
  },

  follows: {
    list: followsList as readonly ProfileView[],

    containsDID(did: string) {
      return followDIDs.has(did);
    },

    async load() {
      followDIDs.clear();
      followsList.length = 0;

      let cursor: string | undefined;

      do {
        const res = await agent.getFollows({
          actor: agent.did!,
          limit: 100,
          cursor,
        });

        for (const follow of res.data.follows) {
          followDIDs.add(follow.did);
          followsList.push(follow);
        }

        cursor = res.data.cursor;
      } while (cursor);
    },
  },

  followers: {
    list: followersList as readonly ProfileView[],

    containsDID(did: string) {
      return followerDIDs.has(did);
    },

    async load() {
      followerDIDs.clear();
      followersList.length = 0;

      let cursor: string | undefined;

      do {
        const res = await agent.getFollowers({
          actor: agent.did!,
          limit: 100,
          cursor,
        });

        for (const followers of res.data.followers) {
          followerDIDs.add(followers.did);
          followersList.push(followers);
        }

        cursor = res.data.cursor;
      } while (cursor);
    },
  },
} as const;
