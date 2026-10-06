import { faker } from "@faker-js/faker";
import type {
  ConferencePosterWorkflowStage,
  ManagedConferencePoster,
} from "#shared/types/managedConferencePoster";
import { getManagedConferenceById } from "~~/server/utils/mockManagedConferences";

faker.seed(2_026_0329);

function seedFor(conferenceId: string, salt: number) {
  return (
    [...conferenceId].reduce((acc, char) => acc + char.charCodeAt(0), 0) +
    salt * 97
  );
}

function buildSubmittedPoster(
  conferenceId: string,
  index: number,
): ManagedConferencePoster {
  faker.seed(seedFor(conferenceId, index));

  const submittedAt = faker.date.recent({ days: 45 }).toISOString();

  return {
    id: `${conferenceId}-poster-${index + 1}`,
    title: faker.lorem.sentence({ min: 4, max: 10 }).replace(/\.$/, ""),
    submitterName: faker.person.fullName(),
    license: faker.helpers.arrayElement([
      "CC-BY-4.0",
      "CC0-1.0",
      "CC-BY-NC-4.0",
    ]),
    submittedAt,
    thumbnailUrl: null,
    status: "submitted",
    submissionKind: "individual",
    updatedAt: submittedAt,
  };
}

function buildInProgressIndividual(
  conferenceId: string,
  index: number,
  workflowStage: ConferencePosterWorkflowStage,
): ManagedConferencePoster {
  faker.seed(seedFor(conferenceId, 500 + index));

  const updatedAt = faker.date.recent({ days: 3 }).toISOString();

  return {
    id: `${conferenceId}-draft-${index + 1}`,
    title: faker.lorem.sentence({ min: 4, max: 9 }).replace(/\.$/, ""),
    submitterName: faker.person.fullName(),
    license: null,
    submittedAt: null,
    thumbnailUrl: null,
    status: "in_progress",
    submissionKind: "individual",
    workflowStage,
    updatedAt,
  };
}

function buildInProgressBulk(
  conferenceId: string,
  workflowStage: ConferencePosterWorkflowStage,
): ManagedConferencePoster {
  faker.seed(seedFor(conferenceId, 900));

  const updatedAt = faker.date.recent({ days: 1 }).toISOString();
  const posterCount = faker.number.int({ min: 12, max: 38 });

  return {
    id: `${conferenceId}-bulk-import-1`,
    title: "Bulk poster import",
    submitterName: "Conference organizer",
    license: null,
    submittedAt: null,
    thumbnailUrl: null,
    status: "in_progress",
    submissionKind: "bulk",
    workflowStage,
    posterCount,
    updatedAt,
  };
}

const POSTERS_BY_CONFERENCE = new Map<string, ManagedConferencePoster[]>();

function ensurePostersForConference(conferenceId: string) {
  if (POSTERS_BY_CONFERENCE.has(conferenceId)) {
    return POSTERS_BY_CONFERENCE.get(conferenceId)!;
  }

  const submittedCount = faker.number.int({ min: 4, max: 9 });
  const submitted = Array.from({ length: submittedCount }, (_, index) =>
    buildSubmittedPoster(conferenceId, index),
  );

  const inProgress: ManagedConferencePoster[] = [
    buildInProgressIndividual(conferenceId, 0, "extracting"),
    buildInProgressIndividual(conferenceId, 1, "review_metadata"),
    buildInProgressBulk(conferenceId, "import_processing"),
  ];

  const posters = [...inProgress, ...submitted].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

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
