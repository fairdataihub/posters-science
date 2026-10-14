import { z } from "zod";

export const CONFERENCE_SEARCH_RESULT_LIMIT = 100;

export const conferenceSearchTermSchema = z
  .string()
  .trim()
  .min(2, "Search term must be at least 2 characters")
  .max(100, "Search term less than or equal to 100 characters");

export function toConferenceLikePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}
