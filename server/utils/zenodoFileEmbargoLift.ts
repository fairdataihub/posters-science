import {
  zenodoPublicRdmAccess,
  type ZenodoRdmAccess,
} from "#shared/utils/zenodoFileEmbargoAccess";
import { getZenodoAccessTokenForApi } from "~~/server/utils/zenodo";
import prisma from "~~/server/utils/prisma";

const config = useRuntimeConfig();

function rdmHeaders(zenodoToken: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${zenodoToken}`,
    ...extra,
  };
}

async function createEditDraftFromPublishedRecord(
  zenodoToken: string,
  recordId: number,
): Promise<
  { success: true; draftId: number } | { success: false; error: string }
> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${recordId}/draft`,
      {
        method: "POST",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
      },
    );

    if (response.ok) {
      const data = (await response.json()) as { id?: string | number };
      const draftId = Number(data.id);
      if (!Number.isFinite(draftId)) {
        return {
          success: false,
          error: `Zenodo returned an unusable draft id for record ${recordId}`,
        };
      }
      return { success: true, draftId };
    }

    if (response.status === 409 || response.status === 400) {
      const existing = await fetch(
        `${config.zenodoApiEndpoint}/records/${recordId}/draft`,
        { headers: rdmHeaders(zenodoToken) },
      );
      if (existing.ok) {
        const data = (await existing.json()) as { id?: string | number };
        const draftId = Number(data.id);
        if (Number.isFinite(draftId)) {
          return { success: true, draftId };
        }
      }
    }

    const body = await response.text().catch(() => "");
    return {
      success: false,
      error: `Could not open a Zenodo edit draft for record ${recordId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Could not open a Zenodo edit draft for record ${recordId}: ${(error as Error).message}`,
    };
  }
}

async function fetchRdmDraftPayload(
  zenodoToken: string,
  draftId: number,
): Promise<
  { success: true; draft: Record<string, unknown> } | { success: false; error: string }
> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${draftId}/draft`,
      { headers: rdmHeaders(zenodoToken) },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        error: `Could not read Zenodo draft ${draftId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    const draft = (await response.json()) as Record<string, unknown>;
    return { success: true, draft };
  } catch (error) {
    return {
      success: false,
      error: `Could not read Zenodo draft ${draftId}: ${(error as Error).message}`,
    };
  }
}

function draftWithPublicAccess(
  draft: Record<string, unknown>,
  access: ZenodoRdmAccess,
): Record<string, unknown> {
  const files =
    draft.files && typeof draft.files === "object"
      ? { ...(draft.files as Record<string, unknown>) }
      : {};

  const merged = {
    ...draft,
    access,
    files: { ...files, enabled: true },
  };

  return prepareRdmDraftForPut(merged);
}

const READ_ONLY_RDM_DRAFT_KEYS = new Set([
  "created",
  "updated",
  "revision_id",
  "links",
  "parent",
  "pid",
  "id",
  "status",
  "versions",
  "deletion_status",
]);

function prepareRdmDraftForPut(
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (READ_ONLY_RDM_DRAFT_KEYS.has(key)) continue;
    payload[key] = value;
  }
  return payload;
}

async function putRdmDraftPayload(
  zenodoToken: string,
  draftId: number,
  payload: Record<string, unknown>,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${draftId}/draft`,
      {
        method: "PUT",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        error: `Zenodo rejected the draft update for ${draftId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update Zenodo draft ${draftId}: ${(error as Error).message}`,
    };
  }
}

async function publishZenodoDraft(
  zenodoToken: string,
  draftId: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${draftId}/draft/actions/publish`,
      {
        method: "POST",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        error: `Zenodo could not publish the embargo update (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to publish Zenodo draft ${draftId}: ${(error as Error).message}`,
    };
  }
}

/**
 * Lifts an active Zenodo file embargo early (same DOI; edit draft + republish).
 */
export async function liftZenodoFileEmbargoForPoster(
  userId: string,
  posterId: number,
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getZenodoAccessTokenForApi(userId);
  if (!accessToken) {
    return { success: false, error: "Sign in to Zenodo before releasing files." };
  }

  const poster = await prisma.poster.findFirst({
    where: { id: posterId, userId },
    select: {
      id: true,
      status: true,
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          filesEmbargoUntil: true,
        },
      },
    },
  });

  if (!poster?.zenodoDepositions?.depositionId) {
    return { success: false, error: "This poster is not linked to Zenodo." };
  }

  if (poster.status !== "published") {
    return {
      success: false,
      error: "Only published posters can have file embargoes lifted.",
    };
  }

  const recordId = poster.zenodoDepositions.depositionId;
  const editDraft = await createEditDraftFromPublishedRecord(
    accessToken,
    recordId,
  );
  if (!editDraft.success) {
    return { success: false, error: editDraft.error };
  }

  const loaded = await fetchRdmDraftPayload(accessToken, editDraft.draftId);
  if (!loaded.success) {
    return { success: false, error: loaded.error };
  }

  const publicAccess = zenodoPublicRdmAccess();
  const updatedPayload = draftWithPublicAccess(loaded.draft, publicAccess);

  const saved = await putRdmDraftPayload(
    accessToken,
    editDraft.draftId,
    updatedPayload,
  );
  if (!saved.success) {
    return { success: false, error: saved.error };
  }

  const published = await publishZenodoDraft(accessToken, editDraft.draftId);
  if (!published.success) {
    return { success: false, error: published.error };
  }

  await prisma.zenodoDeposition.update({
    where: { posterId },
    data: { filesEmbargoUntil: null },
  });

  return { success: true };
}
