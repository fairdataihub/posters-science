defineRouteMeta({
  openAPI: {
    tags: ["Health"],
    summary: "Health check",
    description: "Returns a plain string confirming the server is running.",
    responses: {
      200: {
        description: "Server is healthy",
        content: {
          "text/plain": {
            schema: { type: "string", example: "Looks good! :)" },
          },
        },
      },
    },
  },
});

export default defineEventHandler(async (_event) => {
  return "Looks good! :)";
});
