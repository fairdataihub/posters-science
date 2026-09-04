import { CheerioCrawler, type CheerioCrawlingContext } from "crawlee";

import type { ConferencePosting } from "./schema.js";

import {
  createDeduplicationKey,
  extractConferenceAcronym,
  parseDateRange,
  randomDelay,
  resolveUrl,
} from "./utils.js";

const WIKICFP_BASE_URL = "http://www.wikicfp.com";
const EASYCHAIR_BASE_URL = "https://easychair.org";

const WIKICFP_CATEGORY_LIMIT = 1;

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

async function collectWikiCFPCategories(): Promise<string[]> {
  const categories: string[] = [];
  const allcatUrl = `${WIKICFP_BASE_URL}/cfp/allcat`;

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    maxRequestsPerMinute: 5,

    async requestHandler({ $, log }) {
      const found = parseWikiCFPCategories($);

      categories.push(...found);

      log.info(`WikiCFP: found ${found.length} categories`);
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
        // Ignore invalid URLs.
      }
    });
  }

  return [...urls];
}

function extractWikiCFPConferenceUrls(
  $: CheerioCrawlingContext["$"],
): string[] {
  const urls: string[] = [];

  $('a[href*="/cfp/servlet/event.showcfp"]').each((_, element) => {
    const href = $(element).attr("href");
    const url = resolveUrl(href, WIKICFP_BASE_URL);

    if (url) {
      urls.push(url);
    }
  });

  return [...new Set(urls)];
}

function parseWikiCFPConferenceDetail(
  $: CheerioCrawlingContext["$"],
  conferenceUri: string,
): ConferencePosting | null {
  let conferenceName = $('span[property="v:summary"]').attr("content");

  if (!conferenceName) {
    conferenceName = $("h2 span").first().text().trim();
  }

  if (!conferenceName) {
    return null;
  }

  conferenceName = conferenceName.trim();

  const startDate = $('span[property="v:startDate"]')
    .attr("content")
    ?.split("T")[0];

  const endDate = $('span[property="v:endDate"]')
    .attr("content")
    ?.split("T")[0];

  let location = $('span[property="v:locality"]').attr("content");

  if (!location) {
    $("th").each((_, th) => {
      if ($(th).text().trim() === "Where") {
        location =
          $(th).closest("tr").find("td").eq(1).text().trim() || undefined;
      }
    });
  }

  if (location) {
    location = location.replace(/,\s*$/, "").trim();
  }

  let externalUrl: string | undefined;

  $("a").each((_, link) => {
    const href = $(link).attr("href");

    if (
      !externalUrl &&
      href &&
      !href.startsWith("/cfp") &&
      !href.startsWith("javascript") &&
      /^https?:/.test(href)
    ) {
      externalUrl = href;
    }
  });

  const year =
    startDate?.match(/^(\d{4})/)?.[1] ??
    endDate?.match(/^(\d{4})/)?.[1] ??
    conferenceName.match(/(\d{4})/)?.[1];

  if (!year) {
    return null;
  }

  const conferenceYear = Number.parseInt(year, 10);
  const conferenceAcronym = extractConferenceAcronym(conferenceName);

  return {
    id: createDeduplicationKey(
      conferenceName,
      conferenceAcronym,
      conferenceYear,
      conferenceUri,
    ),
    conferenceName,
    conferenceYear,
    conferenceUri,
    ...(conferenceAcronym && { conferenceAcronym }),
    ...(startDate && { conferenceStartDate: startDate }),
    ...(endDate && { conferenceEndDate: endDate }),
    ...(location && { conferenceLocation: location }),
    ...(externalUrl && { conferenceSchemaUri: externalUrl }),
    _source: "wikicfp",
  };
}

async function collectWikiCFPConferences(
  categoryUrl: string,
): Promise<ConferencePosting[]> {
  const conferenceUrls = new Set<string>();

  const categoryCrawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1000,
    maxRequestsPerMinute: 5,

    async requestHandler(context) {
      const { $, log, request } = context;

      log.info(`WikiCFP: scanning ${request.url}`);

      const urls = extractWikiCFPConferenceUrls($);

      urls.forEach((url) => conferenceUrls.add(url));

      log.info(`WikiCFP: found ${urls.length} conference URLs`);

      const paginationUrls = extractWikiCFPPaginationUrls($, categoryUrl);

      if (paginationUrls.length) {
        await context.addRequests(paginationUrls.map((url) => ({ url })));
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
    `WikiCFP: discovered ${conferenceUrls.size} unique conference detail URLs`,
  );

  if (!conferenceUrls.size) {
    return [];
  }

  const postings: ConferencePosting[] = [];

  const detailCrawler = new CheerioCrawler({
    maxRequestsPerCrawl: conferenceUrls.size,
    maxRequestsPerMinute: 10,

    async requestHandler({ $, log, request }) {
      await randomDelay(100, 6000);

      const posting = parseWikiCFPConferenceDetail($, request.url);

      if (posting) {
        postings.push(posting);
      } else {
        log.warning(`WikiCFP: could not parse ${request.url}`);
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

  const urls = [...conferenceUrls];

  console.log(`WikiCFP: URLs to process: ${urls.length}`);

  await detailCrawler.run(urls);

  console.log(
    `WikiCFP: parsed ${postings.length}/${urls.length} conference pages`,
  );

  return postings;
}

export async function collectWikiCFP(): Promise<ConferencePosting[]> {
  console.log("WikiCFP: fetching categories");

  const categories = await collectWikiCFPCategories();

  if (!categories.length) {
    console.log("WikiCFP: no categories found");

    return [];
  }

  const categoriesToProcess = categories.slice(0, WIKICFP_CATEGORY_LIMIT);

  console.log(
    `WikiCFP: processing ${categoriesToProcess.length}/${categories.length} categories`,
  );

  const postings: ConferencePosting[] = [];

  for (const categoryUrl of categoriesToProcess) {
    console.log(`WikiCFP: processing ${categoryUrl}`);

    await randomDelay(500, 6000);

    postings.push(...(await collectWikiCFPConferences(categoryUrl)));
  }

  console.log(`WikiCFP: collected ${postings.length} postings`);

  return postings;
}

function parseEasyChairConferences(
  $: CheerioCrawlingContext["$"],
): ConferencePosting[] {
  const postings: ConferencePosting[] = [];

  $("tr.green, tr.white").each((_, row) => {
    const cells = $(row).find("td");

    if (cells.length < 5) {
      return;
    }

    const titleLink = $(cells[0]).find("a").first();
    const title = titleLink.text().trim();
    const href = titleLink.attr("href");

    if (!title || !href) {
      return;
    }

    const conferenceUri = resolveUrl(href, EASYCHAIR_BASE_URL);

    if (!conferenceUri) {
      return;
    }

    const location = $(cells[2]).text().trim();
    const rawDate = $(cells[4]).text().trim();
    const acronym = extractConferenceAcronym(title);
    const { startDate, endDate, year } = parseDateRange(rawDate);

    if (!year) {
      return;
    }

    postings.push({
      id: createDeduplicationKey(title, acronym, year, conferenceUri),
      conferenceName: title,
      conferenceYear: year,
      conferenceUri,
      ...(location && { conferenceLocation: location }),
      ...(acronym && { conferenceAcronym: acronym }),
      ...(startDate && { conferenceStartDate: startDate }),
      ...(endDate && { conferenceEndDate: endDate }),
      _source: "easychair",
    });
  });

  return postings;
}

export async function collectEasyChair(): Promise<ConferencePosting[]> {
  const postings: ConferencePosting[] = [];
  const url = `${EASYCHAIR_BASE_URL}/cfp`;

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    maxRequestsPerMinute: 5,

    async requestHandler({ $, log }) {
      const found = parseEasyChairConferences($);

      postings.push(...found);

      log.info(`EasyChair: found ${found.length} postings`);
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

  return postings;
}
