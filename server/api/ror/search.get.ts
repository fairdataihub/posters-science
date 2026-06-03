import { z } from "zod";

const querySchema = z.object({
  query: z.string().min(2, "Query must be at least 2 characters"),
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

interface RorItem {
  id: string;
  names: RorName[];
  locations?: RorLocation[];
}

interface RorResponse {
  items: RorItem[];
}

export default defineEventHandler(async (event) => {
  const result = querySchema.safeParse(getQuery(event));
  if (!result.success) {
    throw createError({ statusCode: 400, message: "Invalid query parameter" });
  }

  const { query } = result.data;

  const response = await $fetch<RorResponse>(
    `https://api.ror.org/v2/organizations`,
    { query: { query } },
  );

  return (response.items ?? []).slice(0, 8).map((item) => {
    const displayName =
      item.names.find((n) => n.types.includes("ror_display"))?.value ??
      item.names[0]?.value ??
      "";
    const country =
      item.locations?.[0]?.geonames_details?.country_name ?? "";

    return { id: item.id, name: displayName, country };
  });
});
