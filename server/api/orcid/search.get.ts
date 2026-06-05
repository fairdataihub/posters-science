import { z } from "zod";

const querySchema = z.object({
  q: z.string().trim().min(1),
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

export default defineEventHandler(async (event) => {
  const result = querySchema.safeParse(getQuery(event));
  if (!result.success) {
    throw createError({ statusCode: 400, message: "q is required" });
  }

  const { q } = result.data;

  const response = await $fetch<OrcidExpandedResponse>(
    "https://pub.orcid.org/v3.0/expanded-search/",
    {
      query: { q, rows: 10 },
      headers: { Accept: "application/json" },
    },
  );

  return (response["expanded-result"] ?? []).map((item) => ({
    orcidId: item["orcid-id"],
    givenName: item["given-names"] ?? "",
    familyName: item["family-names"] ?? "",
    affiliations: item["institution-name"] ?? [],
  }));
});
