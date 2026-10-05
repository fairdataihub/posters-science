import { faker } from "@faker-js/faker";
import type { ManagedConferencePoster } from "#shared/types/managedConferencePoster";
import { getManagedConferenceById } from "~~/server/utils/mockManagedConferences";

faker.seed(2_026_0329);

function buildPoster(
  conferenceId: string,
  index: number,
): ManagedConferencePoster {
  faker.seed(
    [...conferenceId].reduce((acc, char) => acc + char.charCodeAt(0), 0) +
      index * 97,
  );

  return {
    id: `${conferenceId}-poster-${index + 1}`,
    title: faker.lorem.sentence({ min: 4, max: 10 }).replace(/\.$/, ""),
    submitterName: faker.person.fullName(),
    license: faker.helpers.arrayElement([
      "CC-BY-4.0",
      "CC0-1.0",
      "CC-BY-NC-4.0",
    ]),
    submittedAt: faker.date.recent({ days: 45 }).toISOString(),
    thumbnailUrl: null,
  };
}

const POSTERS_BY_CONFERENCE = new Map<string, ManagedConferencePoster[]>();

function ensurePostersForConference(conferenceId: string) {
  if (POSTERS_BY_CONFERENCE.has(conferenceId)) {
    return POSTERS_BY_CONFERENCE.get(conferenceId)!;
  }

  const count = faker.number.int({ min: 4, max: 9 });
  const posters = Array.from({ length: count }, (_, index) =>
    buildPoster(conferenceId, index),
  ).sort(
    (a, b) =>
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );

  POSTERS_BY_CONFERENCE.set(conferenceId, posters);
  return posters;
}

export function listConferencePostersForUser(
  conferenceId: string,
  userId: string,
) {
  const conference = getManagedConferenceById(conferenceId, userId);
  if (!conference || conference.status !== "approved") {
    return [];
  }

  return ensurePostersForConference(conferenceId);
}
