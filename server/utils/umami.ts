let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getUmamiToken(): Promise<string | null> {
  const { umamiUsername, umamiPassword } = useRuntimeConfig();

  if (!umamiUsername || !umamiPassword) return null;

  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const data = await $fetch<{ token: string }>(
      "https://umami.fairdataihub.org/api/auth/login",
      {
        method: "POST",
        body: { username: umamiUsername, password: umamiPassword },
      },
    );

    cachedToken = data.token;

    // Umami tokens are opaque so use a fixed 23-hour expiration to be safe
    // https://github.com/umami-software/umami/discussions/1170
    tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;

    return cachedToken;
  } catch {
    return null;
  }
}
