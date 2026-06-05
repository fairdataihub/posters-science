import { z } from "zod";

const querySchema = z.object({
  givenName: z.string().min(1, "Given name is required"),
  familyName: z.string().min(1, "Family name is required"),
  affiliation: z.string().optional(),
});

interface OrcidExpandedResult {
  "orcid-id": string;
  "given-names": string | null;
  "family-names": string | null;
  "institution-name": string[];
}

interface OrcidExpandedResponse {
  "expanded-result": OrcidExpandedResult[] | null;
  "num-found": number;
}

function quoteIfSpaced(value: string): string {
  return value.includes(" ") ? `"${value}"` : value;
}

export default defineEventHandler(async (event) => {
  const result = querySchema.safeParse(getQuery(event));
  if (!result.success) {
    throw createError({ statusCode: 400, message: "Invalid query parameters" });
  }

  const { givenName, familyName, affiliation } = result.data;

  setResponseHeader(event, "Cache-Control", "no-store");

  let q = `given-names:${quoteIfSpaced(givenName)} AND family-name:${quoteIfSpaced(familyName)}`;
  if (affiliation?.trim()) {
    q += ` AND affiliation-org-name:${quoteIfSpaced(affiliation.trim())}`;
  }

  const response = await $fetch<OrcidExpandedResponse>(
    "https://pub.orcid.org/v3.0/expanded-search/",
    {
      query: { q, rows: 15, start: 0 },
      headers: { Accept: "application/json" },
    },
  );

  return (response["expanded-result"] ?? []).map((r) => ({
    orcidId: r["orcid-id"],
    givenName: r["given-names"] ?? "",
    familyName: r["family-names"] ?? "",
    affiliations: r["institution-name"] ?? [],
  }));
});
