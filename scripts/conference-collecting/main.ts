import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { CollectedConference, ConferenceDatabase } from "./schema.js";

import { collectEasyChair, collectWikiCFP } from "./collectors.js";

import { saveConferenceDatabase } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_PATH = path.join(__dirname, "conference-postings.json");

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("[Main] Starting conference collection");

  const collectors = [
    ["wikicfp", collectWikiCFP],
    ["easychair", collectEasyChair],
  ] as const;

  const collected: CollectedConference[] = [];

  for (const [name, collect] of collectors) {
    try {
      const postings = await collect();

      collected.push(...postings);
    } catch (error) {
      console.error(`[${name}] Collection failed:`, error);
    }
  }

  // Delete existing database file
  try {
    await fs.unlink(DATABASE_PATH);
  } catch {
    // File doesn't exist yet, no action needed
  }

  // Create fresh database with collected postings
  const db: ConferenceDatabase = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalPostings: collected.length,
      sources: [
        ...new Set(
          collected
            .map((posting) => posting._source)
            .filter((source): source is string => Boolean(source)),
        ),
      ],
    },
    postings: collected,
  };

  await saveConferenceDatabase(DATABASE_PATH, db);

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  console.log(`[Main] Complete: ${collected.length} conferences collected`);
  console.log(`[Main] Duration: ${elapsedSec}s`);
  console.log(`[Main] Database: ${DATABASE_PATH}`);
}

main().catch((error) => {
  console.error("[Main] Fatal error:", error);
  process.exit(1);
});
