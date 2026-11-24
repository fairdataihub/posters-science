import { z } from "zod";
import type { HeldPoster } from "#shared/types/bulkWorksheetHold";
import prisma from "~~/server/utils/prisma";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";
import { requirePosterSheetJob } from "~~/server/utils/bulkPosterSheetPending";
import { slackText } from "~~/server/utils/slackText";

const bodySchema = z.object({
  posters: z
    .array(
      z.object({
        posterId: z.number().int(),
        fileName: z.string().trim().min(1).max(255),
        reason: z.enum(["no_row", "unlinked"]),
      }),
    )
    .min(1)
    .max(2000),
  sheetFileName: z.string().trim().max(500).optional(),
  /** Worksheet rows with no poster, for the notice. */
  unmatchedRows: z.array(z.string().trim().max(500)).max(2000).optional(),
});

/** Lines shown in the notice before "and N more". */
const SHOWN = 25;

function listed(lines: string[]) {
  const shown = lines.slice(0, SHOWN).map((line) => `• ${slackText(line)}`);
  if (lines.length > SHOWN) shown.push(`…and ${lines.length - SHOWN} more`);

  return shown.join("\n");
}

/**
 * Holds the posters that didn't match a worksheet row at Review. They can't
 * be published until an admin releases the hold; the rest of the batch can.
 */
export default defineEventHandler(
  async (
    event,
  ): Promise<{ postersHeldAt: string; heldPosters: HeldPoster[] }> => {
    const job = await requirePosterSheetJob(event);
    const { user } = await requireUserSession(event);
    const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));
    if (!body.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Choose the posters to send",
      });
    }

    const record = await prisma.bulkSubmission.findUnique({
      where: { id: job.id },
      select: { postersHeldAt: true, submissionSummary: true },
    });
    if (record?.postersHeldAt) {
      throw createError({
        statusCode: 409,
        statusMessage: "We already have posters from this batch",
      });
    }

    // Only this batch's posters can be held.
    const inBatch = new Set(
      posterIdsFromBulkSubmissionSummary(record?.submissionSummary),
    );
    const seen = new Set<number>();
    const posters = body.data.posters.filter((poster) => {
      if (!inBatch.has(poster.posterId) || seen.has(poster.posterId)) {
        return false;
      }
      seen.add(poster.posterId);

      return true;
    });
    if (!posters.length) {
      throw createError({
        statusCode: 400,
        statusMessage: "These posters aren't in this batch",
      });
    }

    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const name = `${user.givenName ?? ""} ${user.familyName ?? ""}`.trim();
    const reasons = { no_row: "no row", unlinked: "unlinked by organizer" };
    const rows = body.data.unmatchedRows ?? [];
    const text = [
      `*${posters.length} poster(s) on 7-day hold* (email the organizer by ${due})`,
      `From: ${slackText(name || "Unknown")} (${slackText(user.emailAddress)})`,
      `Batch: ${slackText(job.name)} (${job.id})`,
      body.data.sheetFileName
        ? `Worksheet: ${slackText(body.data.sheetFileName)}`
        : null,
      `Posters that didn't match a row:\n${listed(
        posters.map(
          (p) => `${p.fileName} (#${p.posterId}, ${reasons[p.reason]})`,
        ),
      )}`,
      rows.length
        ? `Worksheet rows left without a poster:\n${listed(rows)}`
        : null,
      "The rest of the batch can be published. Release in Admin > Worksheet holds.",
    ]
      .filter(Boolean)
      .join("\n");

    // Slack is off for now, so the notice is only logged.
    // const webhook = useRuntimeConfig(event).slackWebhookUrl;
    // if (webhook) {
    //   const response = await fetch(webhook, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ text }),
    //     signal: AbortSignal.timeout(10_000),
    //   }).catch(() => null);
    //   if (!response?.ok) {
    //     throw createError({
    //       statusCode: 502,
    //       statusMessage: "Could not send these posters. Try again later.",
    //     });
    //   }
    // }
    console.info(`[poster-sheet] Slack notice not sent:\n${text}`);

    const postersHeldAt = new Date();
    await prisma.bulkSubmission.update({
      where: { id: job.id },
      data: { postersHeldAt, heldPosters: posters },
    });

    return { postersHeldAt: postersHeldAt.toISOString(), heldPosters: posters };
  },
);
