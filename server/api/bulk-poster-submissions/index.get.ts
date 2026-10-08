import { getBulkPosterSubmissionJobRepository } from "~~/server/utils/bulkPosterSubmissionJobs";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);

  const repository = getBulkPosterSubmissionJobRepository();
  const data = await repository.listForUser(session.user.id);

  return { data };
});
