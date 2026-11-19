# Figshare deposit (groundwork)

Publishing a poster to the user's own Figshare account, next to Zenodo. This branch has the server side pieces only: no route, UI, database table or feature flag uses them yet.

The mapping follows the draft crosswalk, [poster-json-schema PR #17](https://github.com/fairdataihub/poster-json-schema/pull/17) (`crosswalk/figshare.md`), and the user facing draft page, [Figshare Deposit Details](https://docs.posters.science/docs/figshare-mapping.html). The upload steps follow the Figshare API v2 and FAIRshare's [`src/pyflask/figshare.py`](https://github.com/fairdataihub/FAIRshare/blob/main/src/pyflask/figshare.py).

## What is here

`server/utils/figshareArticle.ts` builds the item payload from `Poster` and `PosterMetadata`. It needs no database or network.

- Title, authors (first and last name, ORCID iD when the checksum passes; organizations by name), keywords (deduplicated), `defined_type: "poster"`.
- One HTML description: the poster's description, the submission abstract under "Abstract", and the "Conference" block agreed on 2026-10-23 ("Presented at Name (ACRONYM), Location, start - end." and the conference link). Over Figshare's 20,000 characters, the conference block stays whole and the longer of the other two is shortened at a word.
- Related materials: DataCite relation and identifier types Figshare accepts pass through; an unsupported identifier type that is a URL is sent as `URL`; version links are left to Figshare; the poster's other identifiers go as `IsIdenticalTo`; the posters.science page as `IsDescribedBy`.
- Funding as text (`Funder, award: title`).
- `missing` lists what Figshare needs before it publishes (title, an author, a keyword, a category, a license, a description), for the publish form to ask for. `dropped` lists values Figshare has no place for; they stay in poster.json.
- `matchFigshareLicense` finds the account's license for a stored SPDX id or URL, exact matches only.

`server/utils/figshare.ts` is the API client, `createFigshareClient({ token })`:

- `account`, `licenses`, `categories`: read what the user's account offers (an institution's portal has its own).
- `createArticle`, `updateArticle`, `getArticle`, `deleteArticle`.
- `removeOwnerIfNotAnAuthor`: Figshare adds the account owner as an author of a new item (FAIRshare deletes it). Removed only when the poster's authors don't name the owner.
- `reserveDoi`, `reserveHandle` (portals that mint Handles).
- `uploadFile`: replaces a file of the same name, then Figshare's multipart upload (name, size and md5, each part, complete).
- `fundingList`: links a grant by id when Figshare's funding search finds exactly one with the same award number and funder, otherwise text.
- `publish`.
- GET, PUT and DELETE retry on 429 and 5xx; POST never retries, so a create or publish can't run twice. Errors are `FigshareError` with the step and status.

Check both without a network:

```bash
npx tsx scripts/check-figshare.ts
```

## Deposit sequence

1. Read the account, its licenses and categories. The publish form lists only those.
2. `buildFigshareArticle`; stop if `missing` is not empty.
3. `createArticle`, and store the item id on the poster right away, so a retry continues this item instead of making a second one.
4. `removeOwnerIfNotAnAuthor`, then `reserveDoi` (or `reserveHandle`), and write the DOI into poster.json.
5. `uploadFile` for the poster file and poster.json.
6. `publish`, then `getArticle` for the DOI, version and status. A portal with curation review holds the item: record it as submitted until it is public.

A new version updates the same item (`updateArticle`, replace the files, publish again). Figshare numbers versions itself; store its number apart from the poster's own version label.

## Still to decide

- How users connect: Figshare OAuth app or personal token (Zenodo supports both).
- Categories: the user picks them when publishing, or we map from a finer research field.
- Institutional portals from the start, or figshare.com only.
- Which other fields join the conference block in the description (affiliations, funder ids, language).

## Verify on a test account

- Whether the owner is still added as an author when the create payload has authors.
- Whether `reserve_doi` returns the versioned DOI (`.v1`).
- The exact fields Figshare requires to publish.
- Whether related materials and linked grants reach DataCite.
- On a portal account: its conference custom fields and curation review.
