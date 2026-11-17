import { createHash } from "node:crypto";
import {
  figshareFundingTitle,
  type DbFundingReference,
  type FigshareArticlePayload,
  type FigshareLicense,
} from "./figshareArticle";

/**
 * Figshare API v2 client for depositing a poster on the user's own Figshare
 * account. Groundwork only: no route or UI uses it yet, and how the user
 * connects (OAuth app or personal token) is still open.
 *
 * Sequence (crosswalk/figshare.md): create a private item, store its id,
 * reserve the DOI, upload the poster file and poster.json, publish, read back.
 * Built from the Figshare API v2 spec and FAIRshare's src/pyflask/figshare.py.
 *
 * Steps marked Verify need a test deposit on a real account first.
 */

export const FIGSHARE_API_URL = "https://api.figshare.com/v2";

export class FigshareError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FigshareError";
  }
}

export type FigshareAccount = {
  id: number;
  user_id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  institution_id?: number;
};

export type FigshareCategory = {
  id: number;
  title: string;
  parent_id?: number;
  source_id?: string;
  taxonomy_id?: number;
};

export type FigshareArticleAuthor = {
  id: number;
  full_name: string;
  orcid_id?: string;
  is_active?: boolean;
};

export type FigsharePrivateArticle = {
  id: number;
  doi?: string;
  handle?: string;
  status?: string;
  version?: number;
  is_public?: boolean;
  url_public_html?: string;
  figshare_url?: string;
  curation_status?: string;
};

type UploadPart = {
  partNo: number;
  startOffset: number;
  endOffset: number;
  status?: string;
};

export type FigshareClientOptions = {
  token: string;
  baseUrl?: string;
  /** For tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Retries for GET, PUT and DELETE on 429 and 5xx. */
  retries?: number;
  /** Base backoff in ms; doubles per retry. */
  backoffMs?: number;
  timeoutMs?: number;
};

const SAFE_TO_RETRY = new Set(["GET", "PUT", "DELETE"]);

/** The last path segment of a Figshare `location` URL (an article or file id). */
export function figshareIdFromLocation(
  location: string | undefined,
): number | undefined {
  const match = location?.match(/\/(\d+)\/?$/);

  return match ? Number(match[1]) : undefined;
}

export function createFigshareClient(options: FigshareClientOptions) {
  const baseUrl = (options.baseUrl ?? FIGSHARE_API_URL).replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 3;
  const backoffMs = options.backoffMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const auth = { Authorization: `token ${options.token}` };

  async function call(
    step: string,
    method: string,
    pathOrUrl: string,
    init: { json?: unknown; body?: Uint8Array; expect?: number[] } = {},
  ): Promise<Response> {
    const url = /^https:\/\//.test(pathOrUrl)
      ? pathOrUrl
      : `${baseUrl}${pathOrUrl}`;
    const headers: Record<string, string> = { ...auth };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.body) {
      body = init.body as unknown as BodyInit;
    }
    const attempts = SAFE_TO_RETRY.has(method) ? retries + 1 : 1;
    let last: Response | undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
      }
      try {
        last = await doFetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt === attempts - 1) {
          throw new FigshareError(
            `Could not reach Figshare: ${(error as Error).message}`,
            step,
          );
        }
        continue;
      }
      if (last.status !== 429 && last.status < 500) break;
    }
    const expect = init.expect ?? [200];
    if (!last || !expect.includes(last.status)) {
      const detail = await last?.text().catch(() => "");
      let message = detail ?? "";
      try {
        message =
          (JSON.parse(detail ?? "") as { message?: string }).message ?? message;
      } catch {
        // not JSON
      }
      throw new FigshareError(
        `Figshare ${step} failed (${last?.status ?? "no response"}): ${message.slice(0, 300)}`,
        step,
        last?.status,
      );
    }

    return last;
  }

  const json = async <T>(response: Response) => (await response.json()) as T;

  return {
    /** The token's account. 401/403 here means the token is not valid. */
    async account() {
      return json<FigshareAccount>(
        await call("read account", "GET", "/account"),
      );
    },

    /** Licenses this account can use (institutions may offer more). */
    async licenses() {
      return json<FigshareLicense[]>(
        await call("read licenses", "GET", "/account/licenses"),
      );
    },

    /** Categories this account can use (an institution's own taxonomy on a portal). */
    async categories() {
      return json<FigshareCategory[]>(
        await call("read categories", "GET", "/account/categories"),
      );
    },

    /** Creates a private item; returns its id. Store it before the next step. */
    async createArticle(payload: FigshareArticlePayload) {
      const response = await call("create item", "POST", "/account/articles", {
        json: payload,
        expect: [201],
      });
      const body = await json<{ entity_id?: number; location?: string }>(
        response,
      );
      const id = body.entity_id ?? figshareIdFromLocation(body.location);
      if (!id)
        throw new FigshareError(
          "Figshare did not return the new item's id",
          "create item",
        );

      return id;
    },

    /** Updates the private copy; the next publish makes it a new version. */
    async updateArticle(
      articleId: number,
      payload: Partial<FigshareArticlePayload>,
    ) {
      await call("update item", "PUT", `/account/articles/${articleId}`, {
        json: payload,
        expect: [205, 200],
      });
    },

    async getArticle(articleId: number) {
      return json<FigsharePrivateArticle>(
        await call("read item", "GET", `/account/articles/${articleId}`),
      );
    },

    /** Only for an item that was never published (a failed first deposit). */
    async deleteArticle(articleId: number) {
      await call("delete item", "DELETE", `/account/articles/${articleId}`, {
        expect: [204],
      });
    },

    async authors(articleId: number) {
      return json<FigshareArticleAuthor[]>(
        await call(
          "read authors",
          "GET",
          `/account/articles/${articleId}/authors`,
        ),
      );
    },

    /**
     * Figshare adds the account owner as an author of a new item; FAIRshare
     * deletes that default author. Here the owner is removed only when the
     * poster's own author list doesn't name them. Verify on a test account
     * whether the owner is still added when the create payload has authors.
     */
    async removeOwnerIfNotAnAuthor(
      articleId: number,
      account: FigshareAccount,
      payloadAuthors: { name?: string; orcid_id?: string }[],
    ) {
      const owner = `${account.first_name ?? ""} ${account.last_name ?? ""}`
        .trim()
        .toLowerCase();
      if (!owner) return false;
      const named = payloadAuthors.some(
        (a) => a.name?.trim().toLowerCase() === owner,
      );
      if (named) return false;
      const current = await this.authors(articleId);
      const ownerAuthor = current.find(
        (a) => a.full_name?.trim().toLowerCase() === owner,
      );
      if (!ownerAuthor || current.length <= 1) return false;
      await call(
        "remove default author",
        "DELETE",
        `/account/articles/${articleId}/authors/${ownerAuthor.id}`,
        { expect: [204] },
      );

      return true;
    },

    /** Verify whether this returns the versioned DOI (`.v1`). */
    async reserveDoi(articleId: number) {
      const body = await json<{ doi: string }>(
        await call(
          "reserve DOI",
          "POST",
          `/account/articles/${articleId}/reserve_doi`,
        ),
      );

      return body.doi;
    },

    /** For portals that mint Handles instead of DOIs. */
    async reserveHandle(articleId: number) {
      const body = await json<{ handle: string }>(
        await call(
          "reserve Handle",
          "POST",
          `/account/articles/${articleId}/reserve_handle`,
        ),
      );

      return body.handle;
    },

    /**
     * Uploads one file: a file of the same name is replaced, then Figshare's
     * multipart upload (initiate with name, size and md5, PUT each part,
     * complete). Returns the file id.
     */
    async uploadFile(articleId: number, name: string, data: Uint8Array) {
      const files = await json<{ id: number; name: string }[]>(
        await call("list files", "GET", `/account/articles/${articleId}/files`),
      );
      for (const old of files.filter((f) => f.name === name)) {
        await call(
          "replace file",
          "DELETE",
          `/account/articles/${articleId}/files/${old.id}`,
          {
            expect: [204],
          },
        );
      }

      const md5 = createHash("md5").update(data).digest("hex");
      const init = await json<{ location?: string }>(
        await call(
          "start upload",
          "POST",
          `/account/articles/${articleId}/files`,
          {
            json: { name, size: data.byteLength, md5 },
            expect: [201],
          },
        ),
      );
      const fileId = figshareIdFromLocation(init.location);
      if (!fileId)
        throw new FigshareError(
          "Figshare did not return the file id",
          "start upload",
        );

      const file = await json<{ upload_url?: string }>(
        await call(
          "read file",
          "GET",
          `/account/articles/${articleId}/files/${fileId}`,
        ),
      );
      if (!file.upload_url?.startsWith("https://")) {
        throw new FigshareError(
          "Figshare did not return an upload URL",
          "read file",
        );
      }
      const upload = await json<{ parts?: UploadPart[] }>(
        await call("read upload parts", "GET", file.upload_url),
      );
      const parts = upload.parts ?? [];
      if (!parts.length)
        throw new FigshareError(
          "Figshare returned no upload parts",
          "read upload parts",
        );
      for (const part of parts) {
        if (part.status === "COMPLETE") continue;
        await call(
          `upload part ${part.partNo} of ${parts.length}`,
          "PUT",
          `${file.upload_url}/${part.partNo}`,
          { body: data.subarray(part.startOffset, part.endOffset + 1) },
        );
      }
      await call(
        "finish upload",
        "POST",
        `/account/articles/${articleId}/files/${fileId}`,
        {
          expect: [202],
        },
      );

      return fileId;
    },

    /**
     * Links each funding reference to a Figshare grant when the search finds
     * exactly one grant with the same award number from the same funder;
     * otherwise keeps the free text entry. Verify that linked grants reach
     * DataCite.
     */
    async fundingList(refs: DbFundingReference[]) {
      const out: ({ id: number } | { title: string })[] = [];
      for (const ref of refs) {
        const title = figshareFundingTitle(ref);
        const award = ref.awardNumber?.trim();
        const funder = ref.funderName?.trim().toLowerCase();
        if (award && funder) {
          try {
            const hits = await json<
              { id: number; grant_code?: string; funder_name?: string }[]
            >(
              await call("search funding", "POST", "/account/funding/search", {
                json: { search_for: award },
              }),
            );
            const same = hits.filter(
              (h) =>
                h.grant_code?.trim() === award &&
                h.funder_name?.trim().toLowerCase() === funder,
            );
            if (same.length === 1) {
              out.push({ id: same[0]!.id });
              continue;
            }
          } catch {
            // Search is a nicety; fall back to text.
          }
        }
        if (title) out.push({ title });
      }

      return out;
    },

    /**
     * Publishes the item (a new version when it was published before). On a
     * portal with curation review the item waits for review: read it back
     * and record it as submitted until it is public.
     */
    async publish(articleId: number) {
      const body = await json<{ location?: string }>(
        await call(
          "publish",
          "POST",
          `/account/articles/${articleId}/publish`,
          {
            expect: [201],
          },
        ),
      );

      return body.location;
    },
  };
}

export type FigshareClient = ReturnType<typeof createFigshareClient>;
