import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Zenodo tokens can create and publish records on a user's Zenodo account,
// so they are encrypted at rest with AES-256-GCM. The user id and column are
// bound in as additional authenticated data, so a value copied to another row
// or column fails to decrypt instead of handing one user's token to another.
//
// Stored format: enc:v1:<iv>:<auth tag>:<ciphertext>, each part base64url.
// The version leaves room to rotate the key later. Zenodo tokens are plain
// alphanumeric strings, so the prefix never collides with a row written in
// plain text before encryption was added.
const PREFIX = "enc:v1:";

export const ENCRYPTED_ZENODO_TOKEN_PREFIX = PREFIX;

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export type ZenodoTokenField = "accessToken" | "refreshToken";

function associatedData(userId: string, field: ZenodoTokenField) {
  return Buffer.from(`zenodo-token:${field}:${userId}`, "utf8");
}

// NUXT_ZENODO_TOKEN_ENCRYPTION_KEY holds 32 random bytes as base64. Generate
// one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
function getEncryptionKey(): Buffer | null {
  const encoded = useRuntimeConfig().zenodoTokenEncryptionKey;

  if (!encoded) return null;

  const key = Buffer.from(encoded, "base64");

  return key.length === KEY_BYTES ? key : null;
}

function requireEncryptionKey(): Buffer {
  const key = getEncryptionKey();

  if (!key) {
    console.error(
      "[Zenodo] NUXT_ZENODO_TOKEN_ENCRYPTION_KEY is missing or is not 32 bytes of base64",
    );

    throw createError({
      statusCode: 500,
      statusMessage: "Zenodo integration is not configured",
    });
  }

  return key;
}

export function isZenodoTokenEncryptionConfigured() {
  return getEncryptionKey() !== null;
}

export function encryptZenodoToken(
  token: string,
  userId: string,
  field: ZenodoTokenField,
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
 * Returns the token in plain text. Rows from before encryption come back as
 * they are. Null means the value was altered or written with a different key;
 * callers treat that as no connection, so the user connects again and the row
 * is overwritten.
 */
export function decryptZenodoToken(
  stored: string,
  userId: string,
  field: ZenodoTokenField,
): string | null {
  if (!stored.startsWith(PREFIX)) return stored;

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
