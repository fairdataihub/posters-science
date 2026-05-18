export default defineEventHandler(async (event) => {
  setHeader(event, "Content-Type", "application/json");

  return $fetch("/_docs/openapi.json", {
    baseURL: getRequestURL(event).origin,
  });
});
