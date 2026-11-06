import { z } from "zod";

// Organization pages read /org/<profileId>. The id comes from the same generator
// as user profiles and is parsed the same way (shared/utils/profile.ts).

export const ORGANIZATION_NAME_MAX = 150;
export const ORGANIZATION_DESCRIPTION_MAX = 1000;
export const ORGANIZATION_WEBSITE_MAX = 300;

export function organizationPath(profileId: string): string {
  return `/org/${profileId}`;
}

export function organizationAvatarUrl(profileId: string): string {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${profileId}`;
}

// The website is shown as a link, so only http and https are accepted.
function isWebAddress(value: string): boolean {
  try {
    const { protocol } = new URL(value);

    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const organizationNameSchema = z
  .string()
  .trim()
  .min(1, "Enter the organization's name")
  .max(
    ORGANIZATION_NAME_MAX,
    `Must be at most ${ORGANIZATION_NAME_MAX} characters`,
  );

export const organizationDetailsSchema = z.object({
  name: organizationNameSchema,
  description: z
    .string()
    .trim()
    .max(
      ORGANIZATION_DESCRIPTION_MAX,
      `Must be at most ${ORGANIZATION_DESCRIPTION_MAX} characters`,
    ),
  websiteUrl: z
    .string()
    .trim()
    .max(
      ORGANIZATION_WEBSITE_MAX,
      `Must be at most ${ORGANIZATION_WEBSITE_MAX} characters`,
    )
    .refine(
      (value) => !value || isWebAddress(value),
      "Enter a full address, such as https://example.org",
    ),
});

export type OrganizationDetails = z.output<typeof organizationDetailsSchema>;

export const ORGANIZATION_INVITE_TTL_DAYS = 14;
export const ORGANIZATION_INVITE_PENDING_MAX = 25;
export const ORGANIZATION_INVITE_RESEND_COOLDOWN_MINUTES = 10;

export const organizationInviteSchema = z.object({
  emailAddress: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Enter a valid email address")
    .pipe(z.email("Enter a valid email address")),
});
