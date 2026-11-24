import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Figshare tokens grant full access to the user's Figshare account (the only
// OAuth scope is "all"), so they are encrypted at rest with AES-256-GCM, the
// same way as Zenodo tokens (zenodoTokenCrypto.ts). The user id, the column
// and the service are bound in as additional authenticated data, so a value
// copied to another row, column or service fails to decrypt.
//
// Stored format: enc:v1:<iv>:<auth tag>:<ciphertext>, each part base64url.
const PREFIX = "enc:v1:";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export type FigshareTokenField = "accessToken" | "refreshToken";

function associatedData(userId: string, field: FigshareTokenField) {
  return Buffer.from(`figshare-token:${field}:${userId}`, "utf8");
}

// NUXT_FIGSHARE_TOKEN_ENCRYPTION_KEY holds 32 random bytes as base64. When it
// is not set, the Zenodo key is used, so an environment that already encrypts
// Zenodo tokens needs no new secret. The associated data keeps the two apart.
function getEncryptionKey(): Buffer | null {
  const config = useRuntimeConfig();
  const encoded =
    config.figshareTokenEncryptionKey || config.zenodoTokenEncryptionKey;

  if (!encoded) return null;

  const key = Buffer.from(encoded, "base64");

  return key.length === KEY_BYTES ? key : null;
}

function requireEncryptionKey(): Buffer {
  const key = getEncryptionKey();

  if (!key) {
    console.error(
      "[Figshare] No token encryption key: set NUXT_FIGSHARE_TOKEN_ENCRYPTION_KEY or NUXT_ZENODO_TOKEN_ENCRYPTION_KEY to 32 bytes of base64",
    );

    throw createError({
      statusCode: 500,
      statusMessage: "Figshare integration is not configured",
    });
  }

  return key;
}

export function isFigshareTokenEncryptionConfigured() {
  return getEncryptionKey() !== null;
}

export function encryptFigshareToken(
  token: string,
  userId: string,
  field: FigshareTokenField,
) {
  const key = requireEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });

  cipher.setAAD(associatedData(userId, field));

  const cipherText = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return `${PREFIX}${[iv, cipher.getAuthTag(), cipherText]
    .map((part) => part.toString("base64url"))
    .join(":")}`;
}

/**
 * Returns the token in plain text, or null when the value was altered, written
 * with a different key, or never encrypted. Figshare tokens were encrypted from
 * the start, so unlike Zenodo there are no plain text rows to pass through.
 * Callers treat null as no connection, so the user connects again and the row
 * is overwritten.
 */
export function decryptFigshareToken(
  stored: string,
  userId: string,
  field: FigshareTokenField,
): string | null {
  if (!stored.startsWith(PREFIX)) return null;

  const key = requireEncryptionKey();
  const parts = stored.slice(PREFIX.length).split(":");

  if (parts.length !== 3) return null;

  const [iv, authTag, cipherText] = parts.map((part) =>
    Buffer.from(part, "base64url"),
  ) as [Buffer, Buffer, Buffer];

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });

    decipher.setAAD(associatedData(userId, field));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(cipherText),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
