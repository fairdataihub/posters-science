/**
 * Where to go after logging in or signing up. Only paths on this site are
 * followed, so a crafted link can't send someone to another site.
 */
export function safeRedirectPath(
  value: unknown,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string") return fallback;

  // "//host" and "/\host" are read by browsers as another site.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) < 32) return fallback;
  }

  try {
    const base = "https://posters.invalid";
    const url = new URL(value, base);

    if (url.origin !== base) return fallback;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
