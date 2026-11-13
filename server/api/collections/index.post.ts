import { z } from "zod";
import {
  COLLECTION_POSTER_MAX,
  COLLECTION_SOURCES,
  collectionDetailsSchema,
} from "#shared/utils/collection";
import {
  assertCollectionAllowance,
  isUniqueClashOn,
  myCollectionSelect,
  toMyCollection,
  withNewCollectionProfileId,
} from "../../utils/collections";
import { logwatch } from "../../utils/logwatch";

const createSchema = collectionDetailsSchema
  .partial({ description: true, conference: true })
  .extend({
    posterIds: z
      .array(z.number().int().positive())
      .max(COLLECTION_POSTER_MAX)
      .optional(),
    sourceBulkSubmissionId: z.string().min(1).max(64).optional(),
    source: z.enum(COLLECTION_SOURCES).optional(),
  });

/**
 * Creates a collection owned by the signed-in person. It stays private until
 * they make it public. It can start with posters, each a published poster they
 * published or claimed, given by its version root, and can be made from one of
 * their bulk uploads, once per upload.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => createSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        body.error.issues[0]?.message ?? "Invalid collection details",
    });
  }

  const { name, description, conference, sourceBulkSubmissionId } = body.data;
  const posterIds = [...new Set(body.data.posterIds ?? [])];

  await assertCollectionAllowance(userId);

  const alreadyMade = (collectionId: string) =>
    createError({
      statusCode: 409,
      statusMessage: "This bulk upload already has a collection",
      data: { reason: "exists", collectionId },
    });

  if (sourceBulkSubmissionId) {
    const batch = await prisma.bulkSubmission.findFirst({
      where: { id: sourceBulkSubmissionId, userId },
      select: { collection: { select: { id: true } } },
    });

    if (!batch) {
      throw createError({
        statusCode: 404,
        statusMessage: "Bulk upload not found",
      });
    }

    if (batch.collection) throw alreadyMade(batch.collection.id);
  }

  if (posterIds.length > 0) {
    const mine = await listablePosterRoots(userId);

    if (posterIds.some((posterId) => !mine.has(posterId))) {
      throw createError({
        statusCode: 403,
        statusMessage:
          "Only published posters you published or claimed can be added",
      });
    }
  }

  let row;

  try {
    row = await withNewCollectionProfileId((profileId) =>
      prisma.collection.create({
        data: {
          profileId,
          ownerId: userId,
          name,
          description: description ?? "",
          conference: conference ?? "",
          sourceBulkSubmissionId: sourceBulkSubmissionId ?? null,
          posters: {
            create: posterIds.map((posterId) => ({ posterId })),
          },
        },
        select: myCollectionSelect,
      }),
    );
  } catch (error) {
    // The same upload was turned into a collection a moment ago.
    if (
      sourceBulkSubmissionId &&
      isUniqueClashOn(error, "sourceBulkSubmissionId")
    ) {
      const existing = await prisma.collection.findUnique({
        where: { sourceBulkSubmissionId },
        select: { id: true },
      });

      if (existing) throw alreadyMade(existing.id);
    }

    throw error;
  }

  logwatch.info({
    action: "collection.create",
    message: "Collection created",
    userId,
    collectionId: row.id,
    source:
      body.data.source ?? (sourceBulkSubmissionId ? "bulk_batch" : "page"),
    posterCount: posterIds.length,
    sourceBulkSubmissionId,
  });

  return toMyCollection(row);
});
