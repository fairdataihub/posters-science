import {
  MAX_CONFERENCE_WORKSHEET_FILES,
  conferenceWorksheetRejection,
} from "#shared/utils/conferenceWorksheets";
import {
  bulkImportConferenceWorksheetPath,
  bulkImportFolderExtension,
} from "~~/server/utils/bulkImportBunnyPaths";
import prisma from "~~/server/utils/prisma";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";

/** Slack mrkdwn treats &, < and > as control characters. */
function slackText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * An organizer chose "Other platform" for poster worksheets and told us about
 * the platform they use, so the team can look at supporting it. Any worksheet
 * files go to the batch's conference-worksheets folder on Bunny. Posted to
 * Slack only when NUXT_SLACK_WEBHOOK_URL is set; the batch then remembers it
 * was sent.
 */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const job = await requirePosterSheetJob(event);
  const { user } = await requireUserSession(event);
  const parts = (await readMultipartFormData(event)) ?? [];

  const field = (name: string) =>
    parts
      .find((part) => part.name === name && !part.filename)
      ?.data.toString("utf8")
      .trim() ?? "";
  const platform = field("platform").slice(0, 100);
  // Another address for replies, when the organizer gave one.
  const contactEmail = field("contact_email");
  if (
    contactEmail &&
    (contactEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Enter a valid email address",
    });
  }
  const worksheets = parts.filter(
    (part) => part.name === "worksheet" && part.filename,
  );

  if (!platform && !worksheets.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Tell us your platform or add your files",
    });
  }
  if (worksheets.length > MAX_CONFERENCE_WORKSHEET_FILES) {
    throw createError({
      statusCode: 400,
      statusMessage: `Add up to ${MAX_CONFERENCE_WORKSHEET_FILES} files`,
    });
  }
  for (const file of worksheets) {
    const problem = conferenceWorksheetRejection({
      name: file.filename!,
      size: file.data.length,
    });
    if (problem) {
      throw createError({
        statusCode: 400,
        statusMessage: `${file.filename}: ${problem}`,
      });
    }
  }

  const config = useRuntimeConfig(event);
  const webhook = config.slackWebhookUrl;
  if (!webhook) return { ok: true };

  const saved: string[] = [];
  if (worksheets.length) {
    const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;
    if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
      throw createError({
        statusCode: 502,
        statusMessage: "Could not save your files. Try again later.",
      });
    }
    const folderExtension = bulkImportFolderExtension(
      config.siteEnv || config.public.siteEnv,
    );
    for (const file of worksheets) {
      // Same safe name twice (files from different folders): keep both.
      let name = file.filename!.replace(/[^a-zA-Z0-9._-]/g, "_");
      while (saved.includes(name)) name = `1-${name}`;
      const response = await fetch(
        `${bunnyPrivateStorage}/${bulkImportConferenceWorksheetPath(folderExtension, job.id, name)}`,
        {
          method: "PUT",
          headers: {
            AccessKey: bunnyPrivateStorageKey,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file.data as BodyInit,
        },
      ).catch(() => null);
      if (!response?.ok) {
        throw createError({
          statusCode: 502,
          statusMessage: "Could not save your files. Try again later.",
        });
      }
      saved.push(name);
    }
  }

  const name = `${user.givenName ?? ""} ${user.familyName ?? ""}`.trim();
  const text = [
    `*Poster worksheet platform request:* ${slackText(platform || "Not given")}`,
    `From: ${slackText(name || "Unknown")} (${slackText(user.emailAddress)})`,
    contactEmail &&
    contactEmail.toLowerCase() !== user.emailAddress?.toLowerCase()
      ? `Reply to: ${slackText(contactEmail)}`
      : null,
    `Batch: ${slackText(job.name)} (${job.id})`,
    saved.length
      ? `Worksheets in Bunny (conference-worksheets): ${saved.map(slackText).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!response?.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: "Could not send your request. Try again later.",
    });
  }

  await prisma.bulkSubmission.update({
    where: { id: job.id },
    data: { posterPlatformDetailsSubmittedToSlack: true },
  });

  return { ok: true };
});
