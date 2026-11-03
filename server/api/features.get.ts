import { getFeatureFlags } from "../utils/features";
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  return getFeatureFlags(event);
});
