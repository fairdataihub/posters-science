import { z } from "zod";

const querySchema = z.object({
  query: z.string().min(2, "Query must be at least 2 characters"),
  simple: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

interface RorName {
  value: string;
  types: string[];
  lang: string | null;
}

interface RorLocation {
  geonames_details?: {
    country_name?: string;
  };
}

interface RorOrganization {
  id: string;
  names?: RorName[];
  locations?: RorLocation[];
}

// The v2 API wraps org data in an `organization` key for `?query=` searches,
// but returns flat items for `?affiliation=` searches. Handle both.
interface RorItem extends RorOrganization {
  organization?: RorOrganization;
}

interface RorResponse {
  items: RorItem[];
}

export default defineEventHandler(async (event) => {
  const result = querySchema.safeParse(getQuery(event));
  if (!result.success) {
    throw createError({ statusCode: 400, message: "Invalid query parameter" });
  }

  const { query, simple } = result.data;

  const rorQuery = simple
    ? { query }
    : {
        "query.advanced": `names.value:(${query
          .trim()
          .split(/\s+/)
          .map((w) => `+${w}`)
          .join(" ")})`,
      };

  const response = await $fetch<RorResponse>(
    "https://api.ror.org/v2/organizations",
    { query: rorQuery },
  );

  return (response.items ?? [])
    .map((item) => {
      const org = item.organization ?? item;
      const displayName =
        org.names?.find((n) => n.types.includes("ror_display"))?.value ??
        org.names?.[0]?.value ??
        "";
      const country = org.locations?.[0]?.geonames_details?.country_name ?? "";

      return { id: org.id, name: displayName, country };
    })
    .filter((item) => item.name)
    .slice(0, 10);
});
