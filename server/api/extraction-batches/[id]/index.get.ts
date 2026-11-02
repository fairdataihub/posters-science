import { getOwnedBatch } from "../../../utils/extractionBatches";
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  return getOwnedBatch(getRouterParam(event, "id")!, session.user.id);
});
