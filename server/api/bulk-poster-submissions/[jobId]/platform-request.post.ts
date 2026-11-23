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
 * "Send it to us" from the worksheet rejection dialog: the organizer's
 * refused worksheet goes to the team, who set it up by hand within 7 days
 * (the hold). The files go to the batch's conference-worksheets folder on
 * Bunny, and Slack gets a hold notice with the chosen format, why the sheet
 * was refused (problems, a JSON list of lines) and the files' Bunny paths.
 * The batch is held (worksheetHeldAt): it can't leave the first step until
 * an admin releases it (POST /api/admin/worksheet-holds/:jobId/release).
 * Without Bunny or NUXT_SLACK_WEBHOOK_URL (local development) the files are
 * not saved or the notice not posted, with a warning; the hold is still set.
 */
export default defineEventHandler(
  async (event): Promise<{ heldAt: string }> => {
    const job = await requirePosterSheetJob(event);
    const current = await prisma.bulkSubmission.findUnique({
      where: { id: job.id },
      select: { worksheetHeldAt: true },
    });
    if (current?.worksheetHeldAt) {
      throw createError({
        statusCode: 409,
        statusMessage: "We already have your worksheet for this batch",
      });
    }
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

    if (!worksheets.length) {
      throw createError({
        statusCode: 400,
        statusMessage: "Add your worksheet files",
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
    const { bunnyPrivateStorage, bunnyPrivateStorageKey } = config;

    const saved: string[] = [];
    if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
      console.warn(
        "[poster-sheet] Bunny private storage is not set; the worksheet files were not saved",
      );
    } else {
      const folderExtension = bulkImportFolderExtension(
        config.siteEnv || config.public.siteEnv,
      );
      const names: string[] = [];
      for (const file of worksheets) {
        // Same safe name twice (files from different folders): keep both.
        let name = file.filename!.replace(/[^a-zA-Z0-9._-]/g, "_");
        while (names.includes(name)) name = `1-${name}`;
        names.push(name);
        const path = bulkImportConferenceWorksheetPath(
          folderExtension,
          job.id,
          name,
        );
        const response = await fetch(`${bunnyPrivateStorage}/${path}`, {
          method: "PUT",
          headers: {
            AccessKey: bunnyPrivateStorageKey,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file.data as BodyInit,
        }).catch(() => null);
        if (!response?.ok) {
          throw createError({
            statusCode: 502,
            statusMessage: "Could not save your files. Try again later.",
          });
        }
        saved.push(path);
      }
    }

    // Why the worksheet was refused, as the organizer saw it (a few lines).
    let problems: string[] = [];
    try {
      const parsed: unknown = JSON.parse(field("problems") || "[]");
      if (Array.isArray(parsed)) {
        problems = parsed
          .filter((line): line is string => typeof line === "string")
          .slice(0, 10)
          .map((line) => line.slice(0, 300));
      }
    } catch {
      // Not sent or not JSON: the files are enough.
    }

    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const name = `${user.givenName ?? ""} ${user.familyName ?? ""}`.trim();
    const text = [
      `*Poster worksheet on 7-day hold* (email the organizer by ${due})`,
      `Chosen format: ${slackText(platform || "Not given")}`,
      `From: ${slackText(name || "Unknown")} (${slackText(user.emailAddress)})`,
      contactEmail &&
      contactEmail.toLowerCase() !== user.emailAddress?.toLowerCase()
        ? `Reply to: ${slackText(contactEmail)}`
        : null,
      `Batch: ${slackText(job.name)} (${job.id})`,
      problems.length
        ? `Why it was refused:\n${problems.map((line) => `• ${slackText(line)}`).join("\n")}`
        : null,
      saved.length
        ? `Files in Bunny:\n${saved.map((path) => `• \`${slackText(path)}\``).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (webhook) {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);

      if (!response?.ok) {
        throw createError({
          statusCode: 502,
          statusMessage: "Could not send your worksheet. Try again later.",
        });
      }
    } else {
      console.warn(
        "[poster-sheet] NUXT_SLACK_WEBHOOK_URL is not set; the hold notice was not posted",
      );
    }

    const heldAt = new Date();
    await prisma.bulkSubmission.update({
      where: { id: job.id },
      data: {
        posterPlatformDetailsSubmittedToSlack: !!webhook,
        worksheetHeldAt: heldAt,
        worksheetHoldFiles: saved,
      },
    });

    return { heldAt: heldAt.toISOString() };
  },
);
