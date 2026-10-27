// Public endpoint. The client uses it to show a notice and disable the matching
// buttons before anyone fires off a request that would be rejected.
export default defineEventHandler(async () => {
  const active = await getActiveMaintenance();

  return { active };
});
