import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { ConferencePosting, ConferencePostingDB } from "./schema.js";

import {
  countPopulatedFields,
  findMatchingPosting,
  getMatchReason,
  mergeConferencePostings,
} from "./utils.js";

export function createEmptyDatabase(): ConferencePostingDB {
  return {
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalPostings: 0,
      sources: [],
    },
    postings: [],
  };
}

export async function loadConferenceDatabase(
  filePath: string,
): Promise<ConferencePostingDB> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<ConferencePostingDB>;

    return {
      metadata: parsed.metadata ?? createEmptyDatabase().metadata,
      postings: Array.isArray(parsed.postings) ? parsed.postings : [],
    };
  } catch {
    return createEmptyDatabase();
  }
}

export async function saveConferenceDatabase(
  filePath: string,
  data: ConferencePostingDB,
): Promise<void> {
  data.metadata = {
    lastUpdated: new Date().toISOString(),
    totalPostings: data.postings.length,
    sources: [
      ...new Set(
        data.postings
          .map((posting) => posting._source)
          .filter((source): source is string => Boolean(source)),
      ),
    ],
  };

  await fs.mkdir(path.dirname(filePath), {
    recursive: true,
  });

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function upsertManyPostings(
  filePath: string,
  postings: ConferencePosting[],
): Promise<void> {
  const db = await loadConferenceDatabase(filePath);
  const deduplicated = [...db.postings];

  let matchedExisting = 0;
  let duplicateWithinBatch = 0;
  let newRecords = 0;
  let recordsMerged = 0;

  for (const incoming of postings) {
    const existing = findMatchingPosting(deduplicated, incoming);

    if (!existing) {
      deduplicated.push(incoming);
      newRecords++;
      continue;
    }

    const existingFromDatabase = db.postings.includes(existing);

    if (existingFromDatabase) {
      matchedExisting++;
    } else {
      duplicateWithinBatch++;
    }

    const existingFields = countPopulatedFields(existing);
    const incomingFields = countPopulatedFields(incoming);
    const merged = mergeConferencePostings(existing, incoming);

    console.log(
      `[DEDUP] ${getMatchReason(existing, incoming)} | ` +
        `${existing.conferenceName} | ` +
        `${existingFields} → ${Math.max(
          existingFields,
          incomingFields,
        )} fields`,
    );

    const index = deduplicated.indexOf(existing);

    if (index !== -1) {
      deduplicated[index] = merged;
    }

    if (existingFromDatabase) {
      recordsMerged++;
    }
  }

  db.postings = deduplicated;

  await saveConferenceDatabase(filePath, db);

  console.log("");
  console.log("Deduplication summary");
  console.log(`Existing:             ${db.postings.length}`);
  console.log(`Collected:            ${postings.length}`);
  console.log(`Matched existing:     ${matchedExisting}`);
  console.log(`Duplicate in batch:   ${duplicateWithinBatch}`);
  console.log(`New records:          ${newRecords}`);
  console.log(`Records merged:       ${recordsMerged}`);
  console.log(`Final records:        ${db.postings.length}`);
}
