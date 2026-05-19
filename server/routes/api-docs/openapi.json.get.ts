export default defineEventHandler(async (event) => {
  setHeader(event, "Content-Type", "application/json");

  const response = await event.fetch("/_docs/openapi.json");

  return response.json();
});
