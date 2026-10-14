// Public profile URLs read /profile/<name>-<profileId>, for example
// /profile/ana-ruiz-k3x9p2q7m4. Only the id after the last hyphen is used to
// find the profile. The name part is cosmetic, so two people with the same
// name never collide, and a renamed user's old links still resolve and are
// redirected to the current spelling.

export const PROFILE_ID_LENGTH = 10;

export const PROFILE_AFFILIATION_MAX = 200;
export const PROFILE_BIO_MAX = 500;

// Lower case letters and digits only. A hyphen in the id would break the
// "everything after the last hyphen" rule.
const PROFILE_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const PROFILE_ID_PATTERN = new RegExp(
  `^[${PROFILE_ID_ALPHABET}]{${PROFILE_ID_LENGTH}}$`,
);

const MAX_SLUG_LENGTH = 60;

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

/** "José María" "Ruiz" becomes "jose-maria-ruiz". May be empty. */
export function profileSlug(givenName: string, familyName: string): string {
  return `${givenName} ${familyName}`
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}

export function profilePath(user: {
  givenName: string;
  familyName: string;
  profileId: string;
}): string {
  const slug = profileSlug(user.givenName, user.familyName);

  return `/profile/${slug ? `${slug}-` : ""}${user.profileId}`;
}

/**
 * Splits the route parameter into the name part and the id. Returns a null id
 * when the parameter does not end in a valid profile id.
 */
export function parseProfileParam(param: string): {
  slug: string;
  profileId: string | null;
} {
  const value = param.trim().toLowerCase();
  const lastHyphen = value.lastIndexOf("-");
  const candidate = lastHyphen === -1 ? value : value.slice(lastHyphen + 1);
  const slug = lastHyphen === -1 ? "" : value.slice(0, lastHyphen);

  return {
    slug,
    profileId: isProfileId(candidate) ? candidate : null,
  };
}
