import { createHash } from "node:crypto";

/**
 * Figshare API v2 client for one user's account. Checked against the API spec
 * at https://docs.figshare.com/swagger.json on 2026-11-19.
 *
 * - Every request names the app in its User-Agent, as Zenodo requests do.
 * - Figshare asks clients to send no more than one request per second
 *   (docs.figshare.com, "Rate limiting"), so a client spaces its requests.
 * - GET, PUT and DELETE are retried on 429, 5xx and network errors. POST is
 *   never retried, so a create, a file start or a publish cannot run twice.
 * - The token never appears in a log or an error message.
 */

export const FIGSHARE_USER_AGENT = "Posters.science (+https://posters.science)";

const MAX_LOGGED_BODY = 500;
const MAX_USER_FACING_BODY = 300;

export class FigshareApiError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FigshareApiError";
  }

  /** Figshare refused the token itself: it was revoked or has expired. */
  get isTokenRejection() {
    return this.status === 401 || this.status === 403;
  }
}

export type FigshareAccount = {
  id: number;
  user_id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  orcid_id?: string;
  institution_id?: number;
  group_id?: number;
  maximum_file_size?: number;
};

export type FigshareLicense = { value: number; name: string; url?: string };

export type FigshareCategory = {
  id: number;
  title: string;
  parent_id?: number;
  path?: string;
  source_id?: string;
  taxonomy_id?: number;
  is_selectable?: boolean;
  has_children?: boolean;
};

export type FigshareAuthor = {
  id: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  orcid_id?: string;
};

/** What the create and update payloads may carry. */
export type FigshareAuthorInput =
  | { id: number }
  | {
      name?: string;
      first_name?: string;
      last_name?: string;
      orcid_id?: string;
    };

export type FigshareRelatedMaterial = {
  identifier: string;
  identifier_type: string;
  relation: string;
  title?: string;
};

export type FigshareArticlePayload = {
  title: string;
  description: string;
  defined_type: "poster";
  authors: FigshareAuthorInput[];
  keywords: string[];
  categories?: number[];
  license?: number;
  related_materials?: FigshareRelatedMaterial[];
  funding_list?: ({ id: number } | { title: string })[];
};

export type FigsharePrivateArticle = {
  id: number;
  title?: string;
  doi?: string;
  handle?: string;
  version?: number;
  status?: string;
  is_public?: boolean;
  curation_status?: string;
  url_public_html?: string;
  url_private_html?: string;
  figshare_url?: string;
  published_date?: string;
};

export type FigshareFile = {
  id: number;
  name: string;
  size?: number;
  status?: string;
  upload_url?: string;
};

type UploadPart = {
  partNo: number;
  startOffset: number;
  endOffset: number;
  status?: string;
};

export type FigshareFundingMatch = {
  id: number;
  title?: string;
  grant_code?: string;
  funder_name?: string;
};

function truncate(body: string, max: number) {
  const flat = body.replace(/\s+/g, " ").trim();

  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Figshare errors are JSON like {"message": "...", "code": "..."}. */
function summarizeFigshareBody(body: string) {
  if (!body) return "";

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      code?: string;
      data?: unknown;
    };

    if (parsed.message) {
      return truncate(parsed.message, MAX_USER_FACING_BODY);
    }
  } catch {
    // not JSON, fall through
  }

  return truncate(body, MAX_USER_FACING_BODY);
}

/** A request to Figshare (or its upload service) that names the app. */
export function figshareFetch(input: string | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  headers.set("User-Agent", FIGSHARE_USER_AGENT);

  return fetch(input, { ...init, headers });
}

/** The last path segment of a Figshare `location` URL (an item or file id). */
export function figshareIdFromLocation(location: string | undefined) {
  const match = location?.match(/\/(\d+)\/?$/);

  return match ? Number(match[1]) : undefined;
}

export type FigshareClientOptions = {
  token: string;
  apiBase: string;
  /** Minimum gap between requests in ms. Figshare asks for at most 1 per second. */
  minIntervalMs?: number;
  retries?: number;
  timeoutMs?: number;
};

const RETRYABLE_METHODS = new Set(["GET", "PUT", "DELETE"]);

export function createFigshareClient(options: FigshareClientOptions) {
  const apiBase = options.apiBase.replace(/\/+$/, "");
  const minIntervalMs = options.minIntervalMs ?? 1000;
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const authorization = `token ${options.token}`;
  let nextRequestAt = 0;

  async function pace() {
    const wait = nextRequestAt - Date.now();

    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    nextRequestAt = Date.now() + minIntervalMs;
  }

  async function request(
    step: string,
    method: string,
    pathOrUrl: string,
    init: { json?: unknown; body?: Uint8Array; expect: number[] },
  ): Promise<Response> {
    const url = /^https?:\/\//.test(pathOrUrl)
      ? pathOrUrl
      : `${apiBase}${pathOrUrl}`;
    const headers: Record<string, string> = { Authorization: authorization };
    let body: BodyInit | undefined;

    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.body) {
      headers["Content-Type"] = "application/octet-stream";
      body = init.body as unknown as BodyInit;
    }

    const attempts = RETRYABLE_METHODS.has(method) ? retries + 1 : 1;
    let lastError: FigshareApiError | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await pace();

      let response: Response;

      try {
        response = await figshareFetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = new FigshareApiError(
          `${step}: could not reach Figshare (${error instanceof Error ? error.name : "network error"})`,
          step,
        );

        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        throw lastError;
      }

      if (init.expect.includes(response.status)) return response;

      const text = await response.text().catch(() => "");

      console.error(
        `[Figshare] ${step}: ${response.status} ${truncate(text, MAX_LOGGED_BODY)}`,
      );

      const summary = summarizeFigshareBody(text);

      lastError = new FigshareApiError(
        `${step}: Figshare answered ${response.status}${summary ? ` - ${summary}` : ""}`,
        step,
        response.status,
      );

      const retryable = response.status === 429 || response.status >= 500;

      if (retryable && attempt < attempts) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, 30) * 1000
            : 1000 * 2 ** attempt;

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw lastError;
    }

    throw lastError ?? new FigshareApiError(`${step}: failed`, step);
  }

  async function json<T>(response: Response) {
    return (await response.json()) as T;
  }

  return {
    async account() {
      return json<FigshareAccount>(
        await request("Read account", "GET", "/account", { expect: [200] }),
      );
    },

    async licenses() {
      return json<FigshareLicense[]>(
        await request("Read licenses", "GET", "/account/licenses", {
          expect: [200],
        }),
      );
    },

    /** The categories the account can use, an institution's own included. */
    async categories() {
      return json<FigshareCategory[]>(
        await request("Read categories", "GET", "/account/categories", {
          expect: [200],
        }),
      );
    },

    async createArticle(payload: FigshareArticlePayload) {
      const body = await json<{ entity_id?: number; location?: string }>(
        await request("Create item", "POST", "/account/articles", {
          json: payload,
          expect: [201],
        }),
      );
      const id = body.entity_id ?? figshareIdFromLocation(body.location);

      if (!id) {
        throw new FigshareApiError(
          "Create item: Figshare did not return the new item's id",
          "Create item",
        );
      }

      return id;
    },

    async updateArticle(articleId: number, payload: FigshareArticlePayload) {
      await request("Update item", "PUT", `/account/articles/${articleId}`, {
        json: payload,
        expect: [200, 205],
      });
    },

    /** Null when the item no longer exists on this account. */
    async getArticle(articleId: number) {
      try {
        return await json<FigsharePrivateArticle>(
          await request("Read item", "GET", `/account/articles/${articleId}`, {
            expect: [200],
          }),
        );
      } catch (error) {
        if (error instanceof FigshareApiError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },

    /** Only private items can be deleted; true when it is gone either way. */
    async deleteArticle(articleId: number) {
      try {
        await request(
          "Delete item",
          "DELETE",
          `/account/articles/${articleId}`,
          { expect: [204] },
        );
      } catch (error) {
        if (error instanceof FigshareApiError && error.status === 404) {
          return true;
        }

        throw error;
      }

      return true;
    },

    async authors(articleId: number) {
      return json<FigshareAuthor[]>(
        await request(
          "Read authors",
          "GET",
          `/account/articles/${articleId}/authors`,
          { expect: [200] },
        ),
      );
    },

    async replaceAuthors(articleId: number, authors: FigshareAuthorInput[]) {
      await request(
        "Set authors",
        "PUT",
        `/account/articles/${articleId}/authors`,
        { json: { authors }, expect: [200, 205] },
      );
    },

    async reserveDoi(articleId: number) {
      const body = await json<{ doi?: string }>(
        await request(
          "Reserve DOI",
          "POST",
          `/account/articles/${articleId}/reserve_doi`,
          { expect: [200, 201] },
        ),
      );

      return body.doi;
    },

    async reserveHandle(articleId: number) {
      const body = await json<{ handle?: string }>(
        await request(
          "Reserve Handle",
          "POST",
          `/account/articles/${articleId}/reserve_handle`,
          { expect: [200, 201] },
        ),
      );

      return body.handle;
    },

    async files(articleId: number) {
      return json<FigshareFile[]>(
        await request(
          "List files",
          "GET",
          `/account/articles/${articleId}/files`,
          { expect: [200] },
        ),
      );
    },

    async deleteFile(articleId: number, fileId: number) {
      await request(
        "Remove file",
        "DELETE",
        `/account/articles/${articleId}/files/${fileId}`,
        { expect: [204, 404] },
      );
    },

    /**
     * Figshare's upload: declare the file (name, size, md5), read where to
     * send it, send each part to the upload service, then mark it complete.
     */
    async uploadFile(articleId: number, name: string, data: Uint8Array) {
      const md5 = createHash("md5").update(data).digest("hex");
      const started = await json<{ location?: string }>(
        await request(
          `Start upload of ${name}`,
          "POST",
          `/account/articles/${articleId}/files`,
          { json: { name, size: data.byteLength, md5 }, expect: [201] },
        ),
      );
      const fileId = figshareIdFromLocation(started.location);

      if (!fileId) {
        throw new FigshareApiError(
          `Start upload of ${name}: Figshare did not return a file id`,
          "Start upload",
        );
      }

      const file = await json<FigshareFile>(
        await request(
          `Read upload of ${name}`,
          "GET",
          `/account/articles/${articleId}/files/${fileId}`,
          { expect: [200] },
        ),
      );

      if (!file.upload_url) {
        throw new FigshareApiError(
          `Read upload of ${name}: Figshare did not return an upload address`,
          "Read upload",
        );
      }

      const uploadInfo = await json<{ parts?: UploadPart[] }>(
        await request(`Plan upload of ${name}`, "GET", file.upload_url, {
          expect: [200],
        }),
      );
      const parts = uploadInfo.parts ?? [];

      for (const part of parts) {
        if (part.status === "COMPLETE") continue;

        await request(
          `Upload part ${part.partNo} of ${name}`,
          "PUT",
          `${file.upload_url}/${part.partNo}`,
          {
            body: data.subarray(part.startOffset, part.endOffset + 1),
            expect: [200, 201, 204],
          },
        );
      }

      await request(
        `Finish upload of ${name}`,
        "POST",
        `/account/articles/${articleId}/files/${fileId}`,
        { expect: [202, 200, 201, 204] },
      );

      return fileId;
    },

    async searchFunding(term: string) {
      return json<FigshareFundingMatch[]>(
        await request("Search funding", "POST", "/account/funding/search", {
          json: { search_for: term },
          expect: [200],
        }),
      );
    },

    async publish(articleId: number) {
      await request(
        "Publish item",
        "POST",
        `/account/articles/${articleId}/publish`,
        { expect: [200, 201] },
      );
    },
  };
}

export type FigshareClient = ReturnType<typeof createFigshareClient>;
