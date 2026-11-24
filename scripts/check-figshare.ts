/**
 * Checks the Figshare payload builder and deposit client without a network:
 *   npx tsx scripts/check-figshare.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildFigshareArticle,
  buildFigshareDescription,
  figshareConferenceBlock,
  matchFigshareLicense,
  shortenFigshareText,
} from "../server/utils/figshareArticle";
import type { FigshareError } from "../server/utils/figshare";
import { createFigshareClient } from "../server/utils/figshare";

const meta = {
  creators: [
    {
      givenName: "Ana",
      familyName: "Silva",
      nameType: "Personal",
      nameIdentifiers: [
        {
          nameIdentifier: "https://orcid.org/0000-0002-1825-0097",
          nameIdentifierScheme: "ORCID",
        },
      ],
    },
    {
      name: "Chen, Bo",
      nameType: "Personal",
      nameIdentifiers: [
        {
          nameIdentifier: "0000-0000-0000-0000",
          nameIdentifierScheme: "ORCID",
        },
      ],
    },
    { name: "Open Genomes Consortium", nameType: "Organizational" },
    { name: "" },
  ],
  subjects: ["genomics", "Genomics", " ", "workflows"],
  identifiers: [
    { identifier: "10.5281/zenodo.123", identifierType: "DOI" },
    { identifier: "10.6084/m9.figshare.9", identifierType: "DOI" },
  ],
  relatedIdentifiers: [
    {
      relatedIdentifier: "10.1000/paper",
      relatedIdentifierType: "DOI",
      relationType: "IsSupplementTo",
    },
    {
      relatedIdentifier: "https://github.com/x/y",
      relatedIdentifierType: "SWHID",
      relationType: "IsSupplementedBy",
    },
    {
      relatedIdentifier: "swh:1:dir:abc",
      relatedIdentifierType: "SWHID",
      relationType: "References",
    },
    {
      relatedIdentifier: "10.1000/old",
      relatedIdentifierType: "DOI",
      relationType: "IsNewVersionOf",
    },
    {
      relatedIdentifier: "10.1000/tr",
      relatedIdentifierType: "DOI",
      relationType: "HasTranslation",
    },
  ],
  fundingReferences: [
    { funderName: "NIH", awardNumber: "R01 123", awardTitle: "Open posters" },
    { funderName: "" },
  ],
  conferenceName: "Bioinformatics Open Source Conference",
  conferenceAcronym: "BOSC",
  conferenceLocation: "Washington, DC, USA",
  conferenceStartDate: "2026-07-14",
  conferenceEndDate: "2026-07-16",
  conferenceUri: "https://www.open-bio.org/events/bosc-2026/",
  posterContent: {
    submissionAbstract: "We built <tools>.\n\nSecond paragraph.",
  },
};

// Payload
const { payload, missing, dropped } = buildFigshareArticle({
  title: "  Open tools for genomes ",
  description: "A poster about tools & workflows.",
  metadata: meta,
  licenseId: 1,
  categoryIds: ["310299"],
  postersScienceUrl: "https://posters.science/poster/42",
  figshareDoi: "10.6084/m9.figshare.9",
});
assert.deepEqual(missing, []);
assert.equal(payload.title, "Open tools for genomes");
assert.equal(payload.defined_type, "poster");
assert.deepEqual(payload.authors, [
  {
    name: "Ana Silva",
    first_name: "Ana",
    last_name: "Silva",
    orcid_id: "0000-0002-1825-0097",
  },
  { name: "Bo Chen", first_name: "Bo", last_name: "Chen" }, // bad ORCID checksum dropped
  { name: "Open Genomes Consortium" },
]);
assert.deepEqual(payload.keywords, ["genomics", "workflows"]);
assert.deepEqual(payload.related_materials, [
  {
    identifier: "10.1000/paper",
    identifier_type: "DOI",
    relation: "IsSupplementTo",
  },
  {
    identifier: "https://github.com/x/y",
    identifier_type: "URL",
    relation: "IsSupplementedBy",
  },
  {
    identifier: "10.5281/zenodo.123",
    identifier_type: "DOI",
    relation: "IsIdenticalTo",
  },
  {
    identifier: "https://posters.science/poster/42",
    identifier_type: "URL",
    relation: "IsDescribedBy",
  },
]);
assert.ok(dropped.some((d) => d.includes("swh:1:dir:abc")));
assert.ok(dropped.some((d) => d.includes("HasTranslation")));
assert.ok(dropped.some((d) => d.includes("Open Genomes Consortium")));
assert.deepEqual(payload.funding_list, [
  { title: "NIH, R01 123: Open posters" },
]);
assert.equal(
  payload.description,
  "<p>A poster about tools &amp; workflows.</p><h3>Abstract</h3><p>We built &lt;tools&gt;.</p><p>Second paragraph.</p>" +
    "<h3>Conference</h3><p>Presented at Bioinformatics Open Source Conference (BOSC), Washington, DC, USA, 2026-07-14 - 2026-07-16.</p>" +
    `<p><a href="${meta.conferenceUri}">${meta.conferenceUri}</a></p>`,
);

// What Figshare needs before publishing
const bare = buildFigshareArticle({
  title: "ab",
  description: "",
  metadata: {},
});
assert.deepEqual(bare.missing, [
  "title (at least 3 characters)",
  "at least one author",
  "at least one keyword",
  "at least one category",
  "a license",
  "a description",
]);

// Conference block leaves out missing parts, never placeholders
assert.equal(
  figshareConferenceBlock({
    conferenceAcronym: "ISMB",
    conferenceStartDate: "2026-07-12",
  }),
  "<h3>Conference</h3><p>Presented at ISMB, 2026-07-12.</p>",
);
assert.equal(
  figshareConferenceBlock({ conferenceUri: "javascript:alert(1)" }),
  "",
);

// Description cap: conference whole, longer part shortened at a word boundary
const long = "word ".repeat(6000).trim();
const capped = buildFigshareDescription(
  "Short description.",
  long,
  meta,
  20_000,
);
assert.ok(capped.length <= 20_000, `length ${capped.length}`);
assert.ok(capped.endsWith(figshareConferenceBlock(meta)));
assert.ok(capped.includes("<p>Short description.</p>"));
assert.ok(/word\.\.\.<\/p><h3>Conference/.test(capped));
assert.equal(shortenFigshareText("alpha beta gamma", 12), "alpha...");

// Licenses: exact matches only
const licenses = [
  {
    value: 1,
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    value: 2,
    name: "CC0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  { value: 3, name: "MIT", url: "https://opensource.org/licenses/MIT" },
  {
    value: 4,
    name: "GPL 3.0+",
    url: "https://www.gnu.org/licenses/gpl-3.0.html",
  },
];
assert.equal(matchFigshareLicense(licenses, "CC-BY-4.0")?.value, 1);
assert.equal(matchFigshareLicense(licenses, "cc0-1.0")?.value, 2);
assert.equal(matchFigshareLicense(licenses, "MIT")?.value, 3);
assert.equal(matchFigshareLicense(licenses, "GPL-3.0-or-later")?.value, 4);
assert.equal(
  matchFigshareLicense(licenses, "https://creativecommons.org/licenses/by/4.0")
    ?.value,
  1,
);
assert.equal(matchFigshareLicense(licenses, "CC-BY-SA-4.0"), undefined);
assert.equal(matchFigshareLicense(licenses, ""), undefined);

// Client against a fake Figshare
const API = "https://api.example/v2";
type Call = { method: string; url: string; body?: unknown };

function fakeFigshare(flakyParts = 0) {
  const calls: Call[] = [];
  const received: Buffer[] = [];
  let failures = flakyParts;
  const data = new TextEncoder().encode("0123456789ABCDEFGHIJ"); // 20 bytes, 3 parts
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const fetchImpl = (async (input: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const url = String(input);
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, url, body });
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      "token secret",
    );
    const a = `${API}/account/articles/77`;
    if (url === `${API}/account/articles` && method === "POST") {
      return reply(201, { entity_id: 77, location: a });
    }
    if (url === `${a}/reserve_doi`)
      return reply(200, { doi: "10.6084/m9.figshare.77" });
    if (url === `${a}/authors`) {
      return reply(200, [
        { id: 5, full_name: "Jo Owner" },
        { id: 6, full_name: "Ana Silva" },
      ]);
    }
    if (url === `${a}/authors/5` && method === "DELETE") return reply(204);
    if (url === `${a}/files` && method === "GET")
      return reply(200, [{ id: 9, name: "poster.pdf" }]);
    if (url === `${a}/files/9` && method === "DELETE") return reply(204);
    if (url === `${a}/files` && method === "POST") {
      const md5 = createHash("md5").update(data).digest("hex");
      assert.deepEqual(body, { name: "poster.pdf", size: 20, md5 });

      return reply(201, { location: `${a}/files/10` });
    }
    if (url === `${a}/files/10` && method === "GET") {
      return reply(200, { upload_url: "https://uploads.example/abc" });
    }
    if (url === "https://uploads.example/abc") {
      return reply(200, {
        parts: [
          { partNo: 1, startOffset: 0, endOffset: 7 },
          { partNo: 2, startOffset: 8, endOffset: 15 },
          { partNo: 3, startOffset: 16, endOffset: 19 },
        ],
      });
    }
    if (url.startsWith("https://uploads.example/abc/") && method === "PUT") {
      if (failures > 0) {
        failures--;

        return reply(503);
      }
      received.push(Buffer.from(init.body as Uint8Array));

      return reply(200);
    }
    if (url === `${a}/files/10` && method === "POST") return reply(202);
    if (url === `${a}/publish`)
      return reply(201, { location: `${API}/articles/77` });
    if (url === `${API}/account/funding/search`) {
      return reply(200, [
        { id: 300, grant_code: "R01 123", funder_name: "NIH" },
      ]);
    }
    if (url === `${API}/account`)
      return reply(403, { message: "Invalid token" });

    return reply(404, { message: `no route ${method} ${url}` });
  }) as typeof fetch;

  return { calls, received, data, fetchImpl };
}

async function main() {
  const fake = fakeFigshare(1);
  const client = createFigshareClient({
    token: "secret",
    baseUrl: `${API}/`,
    fetchImpl: fake.fetchImpl,
    backoffMs: 1,
  });
  const id = await client.createArticle(payload);
  assert.equal(id, 77);
  assert.equal(await client.reserveDoi(id), "10.6084/m9.figshare.77");
  const owner = { id: 1, first_name: "Jo", last_name: "Owner" };
  assert.equal(
    await client.removeOwnerIfNotAnAuthor(id, owner, payload.authors),
    true,
  );
  const author = { id: 1, first_name: "Ana", last_name: "Silva" };
  assert.equal(
    await client.removeOwnerIfNotAnAuthor(id, author, payload.authors),
    false,
  );

  assert.equal(await client.uploadFile(id, "poster.pdf", fake.data), 10);
  // Parts arrive in order and whole; the one 503 was retried.
  assert.equal(Buffer.concat(fake.received).toString(), "0123456789ABCDEFGHIJ");
  // A file of the same name was replaced.
  assert.ok(
    fake.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/files/9")),
  );

  assert.equal(await client.publish(id), `${API}/articles/77`);
  assert.deepEqual(await client.fundingList(meta.fundingReferences), [
    { id: 300 },
  ]);
  assert.deepEqual(
    await client.fundingList([{ funderName: "NSF", awardNumber: "R01 123" }]),
    [{ title: "NSF, R01 123" }],
  );
  await assert.rejects(
    client.account(),
    (e: FigshareError) =>
      e.status === 403 &&
      e.step === "read account" &&
      /Invalid token/.test(e.message),
  );

  // POST is never retried, so a create or publish can't run twice.
  let posts = 0;
  const busy = createFigshareClient({
    token: "secret",
    baseUrl: API,
    fetchImpl: (async () => {
      posts++;

      return new Response(JSON.stringify({ message: "busy" }), { status: 503 });
    }) as unknown as typeof fetch,
    backoffMs: 1,
  });
  await assert.rejects(busy.publish(1), (e: FigshareError) => e.status === 503);
  assert.equal(posts, 1);

  console.log("figshare checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
