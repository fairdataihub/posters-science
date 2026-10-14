import pg from "pg";
const { Pool } = pg;

declare const globalThis: {
  conferenceAggregatorPool?: pg.Pool;
} & typeof global;

export function getConferenceAggregatorPool(): pg.Pool {
  if (globalThis.conferenceAggregatorPool) {
    return globalThis.conferenceAggregatorPool;
  }

  const connectionString = process.env.CONFERENCE_DATABASE_URL;
  if (!connectionString) {
    throw new Error("CONFERENCE_DATABASE_URL is not configured");
  }

  globalThis.conferenceAggregatorPool = new Pool({ connectionString });

  return globalThis.conferenceAggregatorPool;
}

export function formatConferenceDate(
  value: Date | null | undefined,
): string | null {
  if (!value) return null;

  return value.toISOString().slice(0, 10);
}
