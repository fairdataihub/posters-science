defineRouteMeta({
  openAPI: { tags: ["Health"], summary: "API documentation" },
});

export default defineEventHandler((event) => {
  setHeader(event, "Content-Type", "text/html; charset=utf-8");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Documentation - Posters.science</title>
    <style>body { margin: 0 }</style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/_docs/openapi.json"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
});
