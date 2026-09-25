// Single source of truth for the email verification link lifetime.
// The stored token expiry, the copy inside the verification email and the
// wording on the verify screen all read from here so they cannot drift apart.
export const EMAIL_VERIFICATION_TTL_MINUTES = 60;

// Minimum gap between verification emails for one account. Resend requests
// inside this window are accepted but send nothing, so the public endpoint
// cannot be used to mail an address repeatedly.
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES = 2;

/**
 * Human readable form of the link lifetime, for email copy and UI text.
 */
export const emailVerificationTtlLabel = (): string => {
  if (EMAIL_VERIFICATION_TTL_MINUTES % 60 !== 0) {
    return `${EMAIL_VERIFICATION_TTL_MINUTES} minutes`;
  }

  const hours = EMAIL_VERIFICATION_TTL_MINUTES / 60;

  return hours === 1 ? "1 hour" : `${hours} hours`;
};
