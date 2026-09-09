import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CollectedConference } from "../../scripts/conference-collecting/schema.js";

type ConferenceDatabase = {
  postings: CollectedConference[];
};

export default defineEventHandler(async () => {
  const filePath = path.resolve(
    process.cwd(),
    "scripts/conference-collecting/conference-postings.json",
  );

  const content = await readFile(filePath, "utf-8");
  const database = JSON.parse(content) as ConferenceDatabase;
  const postings = database.postings ?? [];
  const conferences = new Map<string, CollectedConference>();

  for (const posting of postings) {
    const existing = conferences.get(posting.conferenceName);

    if (!existing || countFields(posting) > countFields(existing)) {
      conferences.set(posting.conferenceName, posting);
    }
  }

  const options = [...conferences.values()]
    .sort((a, b) => a.conferenceName.localeCompare(b.conferenceName))
    .map((conference) => ({
      label: conference.conferenceName,
      value: conference.conferenceName,
      conferenceName: conference.conferenceName,
      conferenceYear: conference.conferenceYear,
      conferenceAcronym: conference.conferenceAcronym,
      conferenceLocation: conference.conferenceLocation,
      conferenceIdentifier: conference.conferenceIdentifier,
      conferenceIdentifierType: conference.conferenceIdentifierType,
      conferenceStartDate: conference.conferenceStartDate,
      conferenceEndDate: conference.conferenceEndDate,
      conferenceUri: conference.conferenceUri,
      conferenceSeries: conference.conferenceSeries,
      source: conference._source,
    }));

  return { options };
});

function countFields(conference: CollectedConference): number {
  return Object.values(conference).filter(
    (value) => value !== undefined && value !== null && value !== "",
  ).length;
}
