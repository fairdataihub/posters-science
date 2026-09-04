import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ConferencePosting } from "./schema.js";

import { collectEasyChair, collectWikiCFP } from "./collectors.js";

import { loadConferenceDatabase, upsertManyPostings } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_PATH = path.join(__dirname, "conference-postings.json");

export function convertToDisplayConferences(postings: ConferencePosting[]) {
  return postings.map((posting) => ({
    label: posting.conferenceName,
    value: posting.conferenceName,
    acronym: posting.conferenceAcronym,
    url: posting.conferenceUri || "",
  }));
}

export { toPostersSchemaConference } from "./schema.js";

async function main(): Promise<void> {
  console.log("Starting conference collection");

  const collectors = [
    ["wikicfp", collectWikiCFP],
    ["easychair", collectEasyChair],
  ] as const;

  let totalCollected = 0;

  for (const [name, collect] of collectors) {
    console.log(`Collecting: ${name}`);

    try {
      const postings = await collect();

      totalCollected += postings.length;

      await upsertManyPostings(DATABASE_PATH, postings);

      console.log(`Completed: ${name} (${postings.length} postings)`);
    } catch (error) {
      console.error(`Failed: ${name}`, error);
    }
  }

  const db = await loadConferenceDatabase(DATABASE_PATH);

  console.log("");
  console.log(
    `Done: ${totalCollected} collected, ` + `${db.postings.length} in database`,
  );
  console.log(`Saved: ${DATABASE_PATH}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
