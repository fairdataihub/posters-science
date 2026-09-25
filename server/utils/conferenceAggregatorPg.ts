import pg from "pg";

const { Pool } = pg;

declare const globalThis: {
  conferenceAggregatorPool?: pg.Pool;
} & typeof global;

export function getConferenceAggregatorPool(): pg.Pool {
  if (globalThis.conferenceAggregatorPool) {
    return globalThis.conferenceAggregatorPool;
  }

  const connectionString = process.env.CONFERENCE_AGGREGATOR_DATABASE_URL;
  if (!connectionString) {
    throw new Error("CONFERENCE_AGGREGATOR_DATABASE_URL is not configured");
  }

  globalThis.conferenceAggregatorPool = new Pool({ connectionString });
  return globalThis.conferenceAggregatorPool;
}

export type ConferenceAggregatorRow = {
  id: string;
  collectionDate: Date;
  sources: string[];
  conferenceName: string;
  conferenceYear: number | null;
  conferenceUri: string | null;
  conferenceLocation: string | null;
  conferenceStartDate: Date | null;
  conferenceEndDate: Date | null;
  conferenceAcronym: string | null;
  conferenceSeries: string | null;
  conferenceCategories: string[];
  conferenceText: string | null;
  submissionDeadline: Date | null;
};

export function formatConferenceDate(
  value: Date | null | undefined,
): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
