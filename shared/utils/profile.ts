// Public profile URLs read /profile/<profileId>, for example
// /profile/k3x9p2q7m4. The id is random and never changes, so a link keeps
// working whatever the user later does to their name.

export const PROFILE_ID_LENGTH = 10;

export const PROFILE_AFFILIATION_MAX = 200;
export const PROFILE_BIO_MAX = 500;

const PROFILE_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const PROFILE_ID_PATTERN = new RegExp(
  `^[${PROFILE_ID_ALPHABET}]{${PROFILE_ID_LENGTH}}$`,
);

export function generateProfileId(): string {
  const alphabetSize = PROFILE_ID_ALPHABET.length;
  // Bytes at or above this would favour the first few characters, so they
  // are thrown away and redrawn.
  const unbiasedLimit = 256 - (256 % alphabetSize);
  let id = "";

  while (id.length < PROFILE_ID_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(PROFILE_ID_LENGTH));

    for (const byte of bytes) {
      if (byte < unbiasedLimit && id.length < PROFILE_ID_LENGTH) {
        id += PROFILE_ID_ALPHABET[byte % alphabetSize];
      }
    }
  }

  return id;
}

export function isProfileId(value: string): boolean {
  return PROFILE_ID_PATTERN.test(value);
}

export function profilePath(profileId: string): string {
  return `/profile/${profileId}`;
}

/**
 * The profile id in a /profile/<id> route parameter, or null when it isn't
 * one. Case is ignored, so a link someone retyped in capitals still works.
 */
export function parseProfileParam(param: string): string | null {
  const value = param.trim().toLowerCase();

  return isProfileId(value) ? value : null;
}
