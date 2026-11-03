import { requireFeature } from "../../utils/features";
import { getOwnedBatch } from "../../utils/extractionBatches";
import { createId } from "@paralleldrive/cuid2";
import { batchManifestSchema } from "#shared/utils/extractionBatch";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  requireFeature("bulk_extraction", event);
  await assertNotInMaintenance("extraction");

  const parsed = batchManifestSchema.safeParse(await readBody(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid batch",
      message: parsed.error.issues[0]?.message,
    });
  }

  const { requestKey, name, files } = parsed.data;
  const userId = session.user.id;
  const existing = await prisma.extractionBatch.findUnique({
    where: { userId_requestKey: { userId, requestKey } },
  });

  if (existing) return getOwnedBatch(existing.id, userId);

  const config = useRuntimeConfig(event);
  if (!config.bunnyPrivateStorage || !config.bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "File storage is unavailable",
    });
  }
  const environment = config.siteEnv || config.public.siteEnv;
  const folder =
    environment === "production" ? "p" : environment === "staging" ? "s" : "d";

  let batch;
  try {
    // Files are
    // uploaded separately with bounded concurrency
    batch = await prisma.extractionBatch.create({
      data: {
        userId,
        requestKey,
        name,
        totalFiles: files.length,
        jobs: {
          create: files.map((file, batchIndex) => {
            const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

            return {
              batchIndex,
              fileName,
              fileSize: file.size,
              filePath: `posters/${folder}/${createId()}/${fileName}`,
              queueClass: "bulk",
              status: "pending-upload",
              fileUploaded: false,
              poster: {
                create: {
                  userId,
                  title: fileName,
                  description: "",
                  imageUrl: "",
                  status: "draft",
                },
              },
            };
          }),
        },
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    batch = await prisma.extractionBatch.findUnique({
      where: { userId_requestKey: { userId, requestKey } },
    });
    if (!batch) throw error;
  }

  return getOwnedBatch(batch.id, userId);
});
