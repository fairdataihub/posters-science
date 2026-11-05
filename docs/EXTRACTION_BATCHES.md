# Extraction batch API and staging-first features

This document covers two things: how the `bulk_extraction` feature flag works
across the website and the extraction API, and the contract for the batch
endpoints this repository provides. Read the feature flag sections before
configuring anything. Existing single-upload pages and routes are unchanged.

## How the feature flag works

There are two independent flag layers. They share a feature name and nothing
else, so each one has to be set on its own.

| Layer | Setting | Where it lives | What it controls |
| --- | --- | --- | --- |
| Website admission | `NUXT_FEATURES` | GitHub Environment secret, `stg` and `prd` | Whether a guarded route exists for a signed-in user |
| Worker processing | `STAGING_FEATURES`, `PRODUCTION_FEATURES` | Extraction API repository secrets | Whether extraction behaves differently for jobs from that database |

The website decides what new work is accepted. The extraction API decides how a
job it has already been given is processed. Turning the website flag off stops
new submissions; it does not cancel or reclaim work already accepted.

### How a value is resolved

Both layers take a comma-separated list of names. The website registers names in
`shared/utils/features.ts`; the extraction API registers them in
`feature_flags.KNOWN_FEATURES`.

- Empty means every feature is off. `none` also means every feature is off, and
  is the value to write when a default would otherwise enable something.
- An unregistered name is a hard failure, not a silent skip. The website throws
  `Unknown feature: <name>`, and the extraction API fails configuration
  validation.
- The website reads the value from runtime config per request, so a changed
  secret takes effect on redeployment. The worker loads its flags at startup, so
  it needs a restart or redeployment.
- There is no automatic staging fallback and no inheritance between the two
  layers. A repository-level secret alone is shared by both website workflows,
  which is why the website values are set per GitHub Environment instead.

### What "off" looks like

`requireFeature` throws a 404 with the message `Not found`, not a 403. A guarded
route behaves as though it does not exist. That is deliberate, so a disabled
feature is not discoverable, but it does mean a 404 in production is not proof
on its own that the guard fired: an older deployment that never received the
route returns 404 as well. Confirm the same commit is deployed before reading a
404 as a flag result.

### What the flag is not

The flag is resolved from server configuration only. A query string, a request
body field, a header, a storage prefix or a browser toggle cannot enable a
feature or select an environment. On the extraction API side the context comes
from the database target the worker is pulling from, never from a job field, so
`?staging=true` and similar parameters have no effect anywhere.

Flags separate behavior within one deployment. They do not run a second API
branch, model or dependency version, and they do not isolate the installed
poster2json version.

## Configuring the website

`NUXT_FEATURES` is server-only and defaults to empty in `nuxt.config.ts`. Both
deployment workflows read `${{ secrets.NUXT_FEATURES }}` and pass it through
Kamal. `deploy-stg.yml` selects GitHub Environment `stg` for the staging branch
and `deploy-prd.yml` selects `prd` for main, so the same secret name holds a
different value in each environment.

Sync the staging Doppler config to `stg` with `NUXT_FEATURES=bulk_extraction`,
and the production config to `prd` with `NUXT_FEATURES=none`. Redeploy for a
change to take effect.

`GET /api/features` requires sign-in and returns only the feature booleans. Use
it to decide what to show, and let the server enforce admission. Hiding a button
is a courtesy, not a control.

## Configuring the extraction API

The shared extraction API has one deployment, from main, whose single worker
process handles both databases. That is why it keeps separate
`STAGING_FEATURES` and `PRODUCTION_FEATURES` settings rather than one value per
deployment. These are extraction API repository secrets and are not website
secret names.

Initial values are `STAGING_FEATURES=bulk_extraction` and an empty
`PRODUCTION_FEATURES`. Note that both Compose files default `STAGING_FEATURES`
to `bulk_extraction` when the variable is unset, so leaving it blank in a local
`.env` turns staging bulk on. Write `none` to be certain it is off.
`PRODUCTION_FEATURES` defaults to empty, so production fails safe.

The extraction API repository documents its own side, including the scheduler
weights, in `docs/FEATURES_AND_BATCHES.md`.

## Guarding a route

One line, after the session check and before any storage request or database
write:

```ts
import { requireFeature } from "~~/server/utils/features";

export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  requireFeature("bulk_extraction", event);
  // ...
});
```

Guard the admission point only. `POST /api/extraction-batches` is guarded;
reads, uploads and retries are not, so work already accepted can still be
finished after the flag is turned off. Apply the same split to any new feature:
block the route that creates new work, and leave the routes that complete
existing work open.

### The bulk submission routes are not guarded yet

The wizard flow under `server/api/bulk-poster-submissions/` is a separate API
from `/api/extraction-batches`, and none of its routes currently calls
`requireFeature`, so it is reachable in any environment where it is deployed.
The admission point there is `POST /api/bulk-poster-submissions`, which creates
the `BulkSubmission` row. Guarding that one route is enough to stop new bulk
work, because every other route in the flow is keyed on an existing job ID.

Two related notes for whoever picks this up:

- `queueClass: "bulk"` is set only in
  `server/api/extraction-batches/index.post.ts`. Posters created through the
  wizard flow therefore queue with the default single class and do not receive
  bulk scheduling.
- The two APIs overlap in purpose. Whether they converge is a separate
  conversation, and adding the guard does not depend on it.

## Checking the flag without a database or GPU

A temporary read-only probe shares the batch creation guard. Sign in, then open
the endpoint directly in a browser:

- `https://sandbox.posters.science/api/extraction-batches/showcase`
- `https://posters.science/api/extraction-batches/showcase`

| GitHub Environment | Environment secret | Expected signed-in result |
| --- | --- | --- |
| `stg` | `NUXT_FEATURES=bulk_extraction` | 200 with `{ feature, environment, temporary, message }` |
| `prd` | `NUXT_FEATURES=none` | 404 `Not found` |

The success message reads `Hello world! Bulk extraction is enabled for <env>.`
using the configured site environment, with no staging-only condition
hardcoded, so intentionally enabling bulk in production later enables this
endpoint there too. Signed-out requests return 401, because the session check
runs first. Responses are not cached.

This reads configuration only: no database records, uploads, extraction API
calls or GPU work. It verifies the website server's feature guard, not worker
queue routing. After the walkthrough, delete
`server/api/extraction-batches/showcase.get.ts`.

## Endpoint contract

All endpoints require a signed-in session. Batch and file access is scoped to
the owning user. Upload and retry operations also verify draft poster ownership.

| Method | Route                                           | Behavior                                                         |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/features`                                 | Current feature booleans                                         |
| GET    | `/api/extraction-batches/showcase`              | Temporary read-only bulk flag probe                              |
| POST   | `/api/extraction-batches`                       | Create a batch, draft posters and upload placeholders            |
| GET    | `/api/extraction-batches?page=1`                | Owned batch summaries, 20 per page                               |
| GET    | `/api/extraction-batches/:id`                   | Owned batch counts and per-file job status                       |
| POST   | `/api/extraction-batches/:id/files/:jobId`      | Upload the original file and enqueue its extraction              |
| POST   | `/api/extraction-batches/:id/jobs/:jobId/retry` | Retry a failed, uploaded file without changing its bulk priority |

New batch creation requires `bulk_extraction`. Existing accepted work can be
read, uploaded and retried even if that admission flag is subsequently disabled.
Existing extraction maintenance gates apply to uploads and retries.

### Create a batch

Send a JSON manifest to `POST /api/extraction-batches`:

```json
{
  "requestKey": "a403a3b6-b50a-4dd7-ae94-e7cbcf376699",
  "name": "Conference posters",
  "files": [{ "name": "poster.pdf", "type": "application/pdf", "size": 123456 }]
}
```

The manifest accepts 1 to 50 PDF/JPEG/PNG files, at most 10MB each. `requestKey`
is a UUID generated by the client and reused on a retry of the same submission.
Per-user uniqueness makes batch creation idempotent, including concurrent
requests. Nested writes create the batch, draft posters and jobs atomically.

The response includes `id`, `name`, `created`, `counts` and `jobs`. Each job has
an `id` for subsequent requests and a `batchIndex` matching the manifest index.
File names are sanitized for storage.

### Upload each file

Send a separate multipart request with a `file` field to
`POST /api/extraction-batches/:id/files/:jobId`. Name and size must match the
manifest entry. Limit concurrent uploads, for example to two files, instead of
sending a single large multipart batch.

Jobs remain `pending-upload` or `uploading` until storage accepts the file, then
become `pending-extraction`. Atomic status transitions prevent duplicate uploads.
Storage requests have a timeout. A failed upload can be retried through the same
endpoint by selecting the original file. Already uploaded entries are idempotent.

The worker fails abandoned uploads after 15 minutes. Queued extraction jobs are
not subject to this upload timeout. Server-side retry and thumbnail guards keep
unfinished uploads from being queued as extractable files.

### Read progress and retry

Batch counts include `total`, `completed`, `failed`, `queued`, `processing`,
`uploading` and `removed`. Per-file jobs include `status`, `completed`,
`fileUploaded`, `error` and `posterId`. Deleted poster entries count as removed,
preserving the original total. Status is stored in the database, so a client can
leave and resume polling later without losing progress.

Only failed jobs with uploaded files on owned drafts can be retried as
extractions. Upload failures require resending the original file. If metadata
already exists, retry queues thumbnail-only work to avoid overwriting edits.
Completed sibling posters are unaffected. `batchId` and `queueClass` are retained.

## Consuming the API

Shared DTOs live in `shared/utils/extractionBatch.ts`.

- Read `/api/features` for visibility and let the server enforce permissions.
- Reuse a request key when retrying batch creation and map jobs by `batchIndex`.
- Display only the user's own batch counts, statuses, failures and results.
- Keep scheduling priorities and other users' work out of progress messages.
- Poll saved status; provide upload recovery and failed-extraction retries.
- Block editing unfinished batch drafts. Expose completed drafts for review.
- Before opening a completed draft, call the existing
  `GET /api/poster/job/:jobId` completion endpoint, which populates canonical
  identifiers as in the existing single-upload workflow.

## Queue contract

Existing jobs default to `queueClass = single`, `fileUploaded = true` and no
batch. Bulk jobs have `queueClass = bulk` and a `batchId`. Database constraints
reject invalid class/batch combinations. Each job still uses the shared extractor.

The extraction API gives singles a configurable 3:1 preference, rotates
environments within a class and rotates bulk batches. Empty queues do not waste
turns. A running poster finishes before scheduling is reconsidered.

The shared API can read an unmigrated production database while staging uses
the batch schema. The website must apply its migration before running the
updated Prisma client. The migration adds data structures without deleting
existing records.

## Adding another feature

1. Register its name in `shared/utils/features.ts`.
2. Guard its server entry point with `requireFeature("feature_name", event)`
   before storage requests or database mutations.
3. If worker behavior changes, register the name in the extraction API and
   branch in `job_worker.extract_for_environment(local_path, context)` using
   `context.enabled("feature_name")`.
4. Add the name to website `NUXT_FEATURES` in the staging Doppler config
   synced to GitHub Environment `stg`. For worker features, also add it to
   `STAGING_FEATURES` in the extraction API config. Redeploy affected services
   and keep production flags disabled until approved.
5. Enable production once tested. Retire temporary guards and flag entries
   together with their environment settings after the feature is stable.

## Rollout and verification

1. Deploy the extraction API scheduler from main first, with one worker.
2. Back up staging and deploy the website API with its additive migration.
3. Confirm the flag layer: signed in on staging, `GET /api/features` returns
   `bulk_extraction: true` and the showcase endpoint returns 200. On production
   the same two requests return `false` and 404.
4. Exercise batch creation, upload, status and retry through authenticated API
   calls against staging.
5. Verify continued production single extraction. Keep production bulk disabled.

Before any later production migration, verify the target, take a backup and
obtain production-write confirmation. Do not drop batch columns on rollback;
disable new submissions and drain accepted bulk jobs before reverting a worker.

Run Prisma validation and generation, lint and server type checks before
deploying. Real model inference requires a separate smoke test on the GPU
server.
