import { CheerioCrawler, type CheerioCrawlingContext } from "crawlee";

import type { CollectedConference } from "./schema.js";

import {
  createDeduplicationKey,
  extractConferenceAcronym,
  parseDateRange,
  randomDelay,
  resolveUrl,
} from "./utils.js";

const WIKICFP_BASE_URL = "http://www.wikicfp.com";
const EASYCHAIR_BASE_URL = "https://easychair.org";

const WIKICFP_CONFIG: {
  categoryLimit: number | null;
  categoryPageLimit: number | null;
} = {
  categoryLimit: null,
  categoryPageLimit: null,
};

const EASYCHAIR_CONFIG: { pageLimit: number | null } = {
  pageLimit: null,
};

/**
 * Extracts category URLs from the WikiCFP "all categories" page.
 */
function parseWikiCFPCategories($: CheerioCrawlingContext["$"]): string[] {
  const categories: string[] = [];

  $("div.contsec a").each((_, element) => {
    const href = $(element).attr("href");
    const url = resolveUrl(href, WIKICFP_BASE_URL);

    if (url) {
      categories.push(url);
    }
  });

  return [...new Set(categories)];
}

/**
 * Fetches all available WikiCFP categories from the main categories page.
 */
async function collectWikiCFPCategories(): Promise<string[]> {
  const categories: string[] = [];
  const allcatUrl = `${WIKICFP_BASE_URL}/cfp/allcat`;

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    maxRequestsPerMinute: 5,

    async requestHandler({ $, log }) {
      const found = parseWikiCFPCategories($);

      categories.push(...found);

      if (found.length > 0) {
        log.info(`Found ${found.length} WikiCFP categories`);
      }
    },

    errorHandler: async ({ request, log }, error) => {
      log.error(`WikiCFP request failed: ${request.url}`, {
        error: String(error),
      });
    },

    failedRequestHandler: async ({ request, log }) => {
      log.error(`WikiCFP request failed: ${request.url}`);
    },
  });

  await crawler.run([allcatUrl]);

  return [...new Set(categories)];
}

/**
 * Extracts next page URLs from WikiCFP category listing pages.
 */
function extractWikiCFPPaginationUrls(
  $: CheerioCrawlingContext["$"],
  categoryUrl: string,
): string[] {
  const urls = new Set<string>();

  const selectors = [
    ".pagination a",
    ".pager a",
    "div.pages a",
    "div.paging a",
    "a[href*='page=']",
    "a[href*='start=']",
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const href = $(element).attr("href");
      const absoluteUrl = resolveUrl(href, categoryUrl);

      if (!absoluteUrl) {
        return;
      }

      try {
        const url = new URL(absoluteUrl);

        if (url.hostname !== new URL(WIKICFP_BASE_URL).hostname) {
          return;
        }

        if (!url.pathname.includes("/cfp/")) {
          return;
        }

        const isPagination =
          url.searchParams.has("page") ||
          url.searchParams.has("start") ||
          url.searchParams.has("offset");

        if (isPagination) {
          urls.add(url.toString());
        }
      } catch {
        // Ignore invalid URLs (malformed or different domain)
      }
    });
  }

  return [...urls];
}

/**
 * Removes trailing year from conference acronym (e.g., "ATRACC 2026" → "ATRACC").
 */
function cleanAcronym(rawAcronym: string): string {
  return rawAcronym.replace(/\s+\d{4}$/, "").trim();
}

/**
 * Extracts conference URLs and metadata from WikiCFP category listing pages.
 */
function extractWikiCFPConferenceUrls($: CheerioCrawlingContext["$"]): Array<{
  url: string;
  acronym: string;
  series: string;
  startDate?: string;
  endDate?: string;
  location?: string;
}> {
  const results = new Map<
    string,
    {
      url: string;
      acronym: string;
      series: string;
      startDate?: string;
      endDate?: string;
      location?: string;
    }
  >();

  $("a[href*='/cfp/servlet/event.showcfp']").each((_, element) => {
    const href = $(element).attr("href");
    const url = resolveUrl(href, WIKICFP_BASE_URL);
    const rawAcronym = $(element).text().trim();
    const acronym = cleanAcronym(rawAcronym);

    if (!url || !acronym || results.has(url)) {
      return;
    }

    const data: {
      url: string;
      acronym: string;
      series: string;
      startDate?: string;
      endDate?: string;
      location?: string;
    } = { url, acronym, series: rawAcronym };

    // Extract dates and location from the next row in the listing
    const row = $(element).closest("tr");
    const nextRow = row.next("tr");

    if (nextRow.length) {
      const cells = nextRow.find("td");

      // First cell contains dates in format "Nov 5, 2026 - Nov 7, 2026"
      if (cells.length > 0) {
        const dateStr = $(cells[0]).text().trim();
        const dateParts = dateStr.split("-").map((d) => d.trim());

        if (dateParts.length === 2) {
          // Try to parse the dates
          try {
            const startDate = new Date(dateParts[0]);
            const endDate = new Date(dateParts[1]);

            if (!Number.isNaN(startDate.getTime())) {
              data.startDate = startDate.toISOString().split("T")[0];
            }

            if (!Number.isNaN(endDate.getTime())) {
              data.endDate = endDate.toISOString().split("T")[0];
            }
          } catch {
            // Continue without dates if parsing fails
          }
        }
      }

      // Second cell contains location
      if (cells.length > 1) {
        const location = $(cells[1]).text().trim();
        if (location) {
          data.location = location;
        }
      }
    }

    results.set(url, data);
  });

  return [...results.values()];
}

/**
 * Parses conference details from WikiCFP detail page, with fallback to listing page data.
 */
function parseWikiCFPConferenceDetail(
  $: CheerioCrawlingContext["$"],
  conferenceDetailUrl: string,
  acronymFromListing?: string,
  seriesFromListing?: string,
  startDateFromListing?: string,
  endDateFromListing?: string,
  locationFromListing?: string,
): CollectedConference | null {
  let conferenceName: string | undefined = $("span[property='v:description']")
    .text()
    .trim()
    .split(":")
    .slice(1)
    .join(":")
    .trim();

  if (!conferenceName) {
    conferenceName = $("span[property='v:summary']").attr("content");
  }

  if (!conferenceName) {
    conferenceName = $("h2 span").first().text().trim();
  }

  if (!conferenceName) {
    return null;
  }

  conferenceName = conferenceName.trim();

  const conferenceStartDate =
    $("span[property='v:startDate']").attr("content")?.split("T")[0] ||
    startDateFromListing;

  const conferenceEndDate =
    $("span[property='v:endDate']").attr("content")?.split("T")[0] ||
    endDateFromListing;

  let conferenceLocation =
    $("span[property='v:locality']").attr("content") || locationFromListing;

  if (!conferenceLocation) {
    $("th").each((_, th) => {
      if ($(th).text().trim() === "Where") {
        conferenceLocation =
          $(th).closest("tr").find("td").eq(1).text().trim() || undefined;
      }
    });
  }

  if (conferenceLocation) {
    conferenceLocation = conferenceLocation.replace(/,\s*$/, "").trim();
  }

  let conferenceUri = "";

  $("div.contsec td").each((_, cell) => {
    if (conferenceUri || !$(cell).text().trim().startsWith("Link:")) {
      return;
    }

    const href = $(cell).find("a").first().attr("href");

    if (href) {
      conferenceUri = resolveUrl(href, WIKICFP_BASE_URL) ?? "";
    }
  });

  const year =
    conferenceStartDate?.match(/^(\d{4})/)?.[1] ??
    conferenceEndDate?.match(/^(\d{4})/)?.[1] ??
    conferenceName.match(/(\d{4})/)?.[1];

  if (!year) {
    return null;
  }

  const conferenceYear = Number.parseInt(year, 10);
  const conferenceAcronym =
    acronymFromListing || extractConferenceAcronym(conferenceName);

  return {
    id: createDeduplicationKey(
      conferenceName,
      conferenceAcronym,
      conferenceYear,
      conferenceDetailUrl,
    ),
    conferenceName,
    conferenceYear,
    conferenceUri,
    ...(seriesFromListing && { conferenceAcronym: seriesFromListing }),
    ...(conferenceAcronym && { conferenceSeries: conferenceAcronym }),
    ...(conferenceStartDate && { conferenceStartDate }),
    ...(conferenceEndDate && { conferenceEndDate }),
    ...(conferenceLocation && { conferenceLocation }),
    _source: "wikicfp",
  };
}

/**
 * Collects all conferences from a WikiCFP category by crawling listing and detail pages.
 */
async function collectWikiCFPConferences(
  categoryUrl: string,
  categoryNumber: number,
  categoryTotal: number,
): Promise<CollectedConference[]> {
  const conferenceUrls = new Map<
    string,
    {
      acronym: string;
      series: string;
      startDate?: string;
      endDate?: string;
      location?: string;
    }
  >();
  let categoryPagesScanned = 0;

  const categoryCrawler = new CheerioCrawler({
    maxRequestsPerCrawl: WIKICFP_CONFIG.categoryPageLimit ?? 5000,
    maxRequestsPerMinute: 20,
    maxConcurrency: 1,

    async requestHandler(context) {
      const { $, log } = context;
      categoryPagesScanned++;

      log.debug(
        `Category ${categoryNumber}/${categoryTotal}, page ${categoryPagesScanned}`,
      );

      const conferenceData = extractWikiCFPConferenceUrls($);

      conferenceData.forEach(
        ({ url, acronym, series, startDate, endDate, location }) => {
          if (!conferenceUrls.has(url)) {
            conferenceUrls.set(url, {
              acronym,
              series,
              startDate,
              endDate,
              location,
            });
          }
        },
      );

      log.debug(
        `Found ${conferenceData.length} conferences (${conferenceUrls.size} unique total)`,
      );

      if (
        WIKICFP_CONFIG.categoryPageLimit !== null &&
        categoryPagesScanned >= WIKICFP_CONFIG.categoryPageLimit
      ) {
        return;
      }

      const paginationUrls = extractWikiCFPPaginationUrls($, categoryUrl);

      if (paginationUrls.length) {
        await context.addRequests([{ url: paginationUrls[0] }]);
      }
    },

    errorHandler: async ({ request, log }, error) => {
      log.error(`WikiCFP category request failed: ${request.url}`, {
        error: String(error),
      });
    },

    failedRequestHandler: async ({ request, log }) => {
      log.error(`WikiCFP category request permanently failed: ${request.url}`);
    },
  });

  await categoryCrawler.run([categoryUrl]);

  console.log(
    `[WikiCFP] Category ${categoryNumber}/${categoryTotal}: ` +
      `${conferenceUrls.size} conferences across ${categoryPagesScanned} pages`,
  );

  if (!conferenceUrls.size) {
    return [];
  }

  const postings: CollectedConference[] = [];

  const detailCrawler = new CheerioCrawler({
    maxRequestsPerCrawl: conferenceUrls.size,
    maxRequestsPerMinute: 20,

    async requestHandler({ $, log, request }) {
      await randomDelay(100, 1000);

      const data = conferenceUrls.get(request.url);
      const posting = parseWikiCFPConferenceDetail(
        $,
        request.url,
        data?.acronym,
        data?.series,
        data?.startDate,
        data?.endDate,
        data?.location,
      );

      if (posting) {
        postings.push(posting);
      } else {
        log.debug(`Could not parse conference: ${request.url}`);
      }
    },

    errorHandler: async ({ request, log }, error) => {
      log.error(`WikiCFP detail request failed: ${request.url}`, {
        error: String(error),
      });
    },

    failedRequestHandler: async ({ request, log }) => {
      log.error(`WikiCFP detail request permanently failed: ${request.url}`);
    },
  });

  const urls = [...conferenceUrls.keys()];

  await detailCrawler.run(urls);

  console.log(
    `[WikiCFP] Category ${categoryNumber}/${categoryTotal}: ` +
      `parsed ${postings.length}/${urls.length} conferences`,
  );

  return postings;
}

export async function collectWikiCFP(): Promise<CollectedConference[]> {
  const categories = await collectWikiCFPCategories();

  if (!categories.length) {
    console.log("[WikiCFP] No categories found");

    return [];
  }

  const categoriesToProcess =
    WIKICFP_CONFIG.categoryLimit === null
      ? categories
      : categories.slice(0, WIKICFP_CONFIG.categoryLimit);

  console.log(
    `[WikiCFP] Processing ${categoriesToProcess.length}/${categories.length} categories`,
  );

  const postings: CollectedConference[] = [];

  for (const [index, categoryUrl] of categoriesToProcess.entries()) {
    await randomDelay(200, 1500);

    const categoryPostings = await collectWikiCFPConferences(
      categoryUrl,
      index + 1,
      categoriesToProcess.length,
    );

    postings.push(...categoryPostings);
  }

  console.log(`[WikiCFP] Collected ${postings.length} conferences`);

  return postings;
}

/**
 * Parses conference listings from EasyChair search results page.
 */
function parseEasyChairConferences(
  $: CheerioCrawlingContext["$"],
): CollectedConference[] {
  const postings: CollectedConference[] = [];

  $("tr.green, tr.white").each((_, row) => {
    const cells = $(row).find("td");

    if (cells.length < 5) {
      return;
    }

    const titleLink = $(cells[0]).find("a").first();
    const rawAcronym = titleLink.text().trim();
    const title = $(cells[1]).text().trim();
    const href = titleLink.attr("href");

    if (!title || !href || !rawAcronym) {
      return;
    }

    const conferenceUri = resolveUrl(href, EASYCHAIR_BASE_URL);

    if (!conferenceUri) {
      return;
    }

    const acronym = cleanAcronym(rawAcronym);
    const conferenceSeries = rawAcronym;
    const conferenceLocation = $(cells[2]).text().trim();
    const rawDate = $(cells[4]).text().trim();
    const {
      startDate: conferenceStartDate,
      endDate: conferenceEndDate,
      year: conferenceYear,
    } = parseDateRange(rawDate);

    if (!conferenceYear) {
      return;
    }

    postings.push({
      id: createDeduplicationKey(title, acronym, conferenceYear, conferenceUri),
      conferenceName: title,
      conferenceYear,
      conferenceUri,
      ...(conferenceLocation && { conferenceLocation }),
      ...(acronym && { conferenceAcronym: acronym }),
      ...(conferenceSeries && { conferenceSeries }),
      ...(conferenceStartDate && { conferenceStartDate }),
      ...(conferenceEndDate && { conferenceEndDate }),
      _source: "easychair",
    });
  });

  return postings;
}

/**
 * Extracts next page URLs from EasyChair search results.
 */
function extractEasyChairPaginationUrls(
  $: CheerioCrawlingContext["$"],
  currentUrl: string,
): string[] {
  const urls = new Set<string>();

  $(".pagination a, .pager a, a[href*='page=']").each((_, element) => {
    const url = resolveUrl($(element).attr("href"), currentUrl);

    if (!url) {
      return;
    }

    try {
      const parsedUrl = new URL(url);

      if (
        parsedUrl.hostname === new URL(EASYCHAIR_BASE_URL).hostname &&
        parsedUrl.pathname === "/cfp" &&
        parsedUrl.searchParams.has("page")
      ) {
        urls.add(parsedUrl.toString());
      }
    } catch {
      // Ignore URLs that don't match EasyChair CFP search parameters
    }
  });

  return [...urls];
}

/**
 * Extracts the conference website URL from EasyChair detail page.
 */
function extractEasyChairConferenceWebsite(
  $: CheerioCrawlingContext["$"],
): string {
  let conferenceWebsite = "";

  $("table.date_table tr").each((_, row) => {
    if (conferenceWebsite) {
      return;
    }

    const cells = $(row).find("td");

    if ($(cells[0]).text().trim().toLowerCase() !== "conference web page") {
      return;
    }

    const href = $(cells[1]).find("a").first().attr("href");
    conferenceWebsite = resolveUrl(href, EASYCHAIR_BASE_URL) ?? "";
  });

  return conferenceWebsite;
}

export async function collectEasyChair(): Promise<CollectedConference[]> {
  const postings: CollectedConference[] = [];
  const url = `${EASYCHAIR_BASE_URL}/cfp`;
  let pagesScanned = 0;

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: EASYCHAIR_CONFIG.pageLimit ?? 5000,
    maxRequestsPerMinute: 20,
    maxConcurrency: 1,

    async requestHandler({ $, log, request, addRequests }) {
      pagesScanned++;
      const found = parseEasyChairConferences($);

      postings.push(...found);

      log.debug(`Page ${pagesScanned}: found ${found.length} conferences`);

      if (
        EASYCHAIR_CONFIG.pageLimit !== null &&
        pagesScanned >= EASYCHAIR_CONFIG.pageLimit
      ) {
        return;
      }

      const paginationUrls = extractEasyChairPaginationUrls($, request.url);

      if (paginationUrls.length) {
        await addRequests([{ url: paginationUrls[0] }]);
      }
    },

    errorHandler: async ({ request, log }, error) => {
      log.error(`EasyChair request failed: ${request.url}`, {
        error: String(error),
      });
    },

    failedRequestHandler: async ({ request, log }) => {
      log.error(`EasyChair request failed: ${request.url}`);
    },
  });

  await crawler.run([url]);

  const limitedPostings =
    EASYCHAIR_CONFIG.pageLimit !== null
      ? postings.slice(0, EASYCHAIR_CONFIG.pageLimit)
      : postings;

  const postingsByDetailUrl = new Map(
    limitedPostings.map((posting) => [posting.conferenceUri, posting]),
  );
  const conferenceUrls = [...postingsByDetailUrl.keys()].filter(
    (conferenceUrl): conferenceUrl is string => Boolean(conferenceUrl),
  );

  limitedPostings.forEach((posting) => {
    posting.conferenceUri = "";
  });

  const detailCrawler = new CheerioCrawler({
    maxRequestsPerCrawl: conferenceUrls.length,
    maxRequestsPerMinute: 20,

    async requestHandler({ $, request, log }) {
      const posting = postingsByDetailUrl.get(request.url);

      if (!posting) {
        return;
      }

      const conferenceWebsite = extractEasyChairConferenceWebsite($);
      posting.conferenceUri = conferenceWebsite;

      log.debug(`${conferenceWebsite ? "Found" : "No"} conference website`);
    },

    errorHandler: async ({ request, log }, error) => {
      log.error(`EasyChair detail request failed: ${request.url}`, {
        error: String(error),
      });
    },

    failedRequestHandler: async ({ request, log }) => {
      log.error(`EasyChair detail request permanently failed: ${request.url}`);
    },
  });

  await detailCrawler.run(conferenceUrls);

  console.log(`[EasyChair] Collected ${limitedPostings.length} conferences`);

  return limitedPostings;
}
