/**
 * Conference Postings Scraper with Crawlee
 *
 * Uses Crawlee to scrape conference postings from various sources.
 * Supports both static HTML and JavaScript-rendered pages.
 *
 * Setup:
 *   pnpm add crawlee
 *
 * Usage:
 *   npx tsx scrape-conference-postings.ts
 */

import { CheerioCrawler, Configuration } from "crawlee";
import type { ScrapedConference } from "./conference-utils.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure Crawlee storage
Configuration.getGlobalConfig().set("persistStoreDir", "./crawlee-storage");

interface ConferencePosting {
  title: string;
  url: string;
  deadline: string;
  conferenceDate: string;
  location: string;
  acronym?: string;
  description?: string;
  submissionLink?: string;
}

/**
 * Scrape WikiCFP conference postings
 * This is a skeleton - expand with actual selectors
 */
async function scrapeWikiCFP(): Promise<void> {
  try {
    const db = await loadPostingsDB();

    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: 100,
      maxRequestsPerMinute: 30, // Rate limiting

      async requestHandler({ request, $, log }) {
        try {
          log.info(`Scraping: ${request.url}`);

          // TODO: Implement actual selectors for WikiCFP
          // Example structure (verify with actual site):
          $("table.TableHeadingsBkg tr").each((i, el) => {
            try {
              const $row = $(el);

              // TODO: Update these selectors based on actual WikiCFP HTML
              const title = $row.find("td:nth-child(1)").text().trim();
              const abbreviation = $row.find("td:nth-child(2)").text().trim();
              const deadline = $row.find("td:nth-child(3)").text().trim();
              const confDate = $row.find("td:nth-child(4)").text().trim();
              const notificationDate = $row
                .find("td:nth-child(5)")
                .text()
                .trim();
              const conferenceLink = $row
                .find("td:nth-child(1) a")
                .attr("href");

              if (title) {
                const posting: ConferencePosting = {
                  title,
                  url: conferenceLink || request.url,
                  deadline,
                  conferenceDate: confDate,
                  location: "", // TODO: Extract from description or separate field
                  acronym: abbreviation,
                  description: `Notification: ${notificationDate}`,
                  source: "wikicfp",
                };

                log.debug(`Found posting: ${posting.title}`);
                // In real implementation, would collect these
              }
            } catch (error) {
              log.warning(`Error parsing row: ${error}`);
            }
          });
        } catch (error) {
          log.error(`Error in request handler: ${error}`);
        }
      },

      errorHandler: async ({ request, log }, error) => {
        try {
          log.error(`Request failed: ${request.url}`);
          log.error(String(error));
        } catch (err) {
          console.error(`Error in error handler: ${err}`);
        }
      },

      failedRequestHandler: async ({ request, log }) => {
        try {
          log.warning(`Failed request: ${request.url}`);
        } catch (err) {
          console.error(`Error in failed request handler: ${err}`);
        }
      },
    });

    // TODO: Add starting URLs
    const startUrls = [
      "https://www.wikicfp.com/cfp/servlet/cmt?section=cfp&sort=deadline",
    ];

    await crawler.run(startUrls);
    await savePostingsDB(db);
  } catch (error) {
    console.error("❌ Error in scrapeWikiCFP:", error);
    throw error;
  }
}

/**
 * Load postings from the temporary JSON database
 */
async function loadPostingsDB(): Promise<{
  metadata: { lastUpdated: string; totalPostings: number; sources: string[] };
  postings: ConferencePosting[];
}> {
  const dbPath = path.join(__dirname, "conference-postings.json");

  try {
    const content = fs.readFileSync(dbPath, "utf-8");

    return JSON.parse(content);
  } catch (error) {
    console.warn("Could not load existing database, starting fresh:", error);

    return {
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalPostings: 0,
        sources: [],
      },
      postings: [],
    };
  }
}

/**
 * Save postings to the temporary JSON database
 */
async function savePostingsDB(data: {
  metadata: { lastUpdated: string; totalPostings: number; sources: string[] };
  postings: ConferencePosting[];
}): Promise<void> {
  try {
    const dbPath = path.join(__dirname, "conference-postings.json");

    // Update metadata
    data.metadata.lastUpdated = new Date().toISOString();
    data.metadata.totalPostings = data.postings.length;
    data.metadata.sources = Array.from(
      new Set(data.postings.map((p) => p.source || "unknown")),
    );

    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Saved ${data.postings.length} postings to ${dbPath}`);
  } catch (error) {
    console.error("❌ Error saving postings database:", error);
    throw error;
  }
}

/**
 * Add a new posting to the database (prevents duplicates by URL)
 */
async function addPosting(posting: ConferencePosting): Promise<{
  metadata: { lastUpdated: string; totalPostings: number; sources: string[] };
  postings: ConferencePosting[];
}> {
  try {
    const db = await loadPostingsDB();

    // Prevent duplicates by URL
    if (!db.postings.find((p) => p.url === posting.url)) {
      // Add ID if not present
      if (!posting.id) {
        posting.id = `posting-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      posting.dateExtracted = new Date().toISOString();
      db.postings.push(posting);
    }

    await savePostingsDB(db);

    return db;
  } catch (error) {
    console.error("❌ Error adding posting:", error);
    throw error;
  }
}

/**
 * Clear all postings from the database
 */
async function clearPostingsDB(): Promise<void> {
  try {
    const dbPath = path.join(__dirname, "conference-postings.json");
    const freshDB = {
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalPostings: 0,
        sources: [],
      },
      postings: [],
    };
    fs.writeFileSync(dbPath, JSON.stringify(freshDB, null, 2), "utf-8");
    console.log("🗑️  Cleared conference postings database");
  } catch (error) {
    console.error("❌ Error clearing postings database:", error);
    throw error;
  }
}
function convertToConferences(
  postings: ConferencePosting[],
): ScrapedConference[] {
  try {
    return postings.map((posting) => ({
      label: posting.title,
      value: posting.title,
      acronym: posting.acronym,
      deadline: posting.deadline,
      url: posting.url,
    }));
  } catch (error) {
    console.error("❌ Error converting postings to conferences:", error);
    throw error;
  }
}

/**
 * Main orchestration function
 */
async function main() {
  try {
    console.log("🚀 Starting conference postings scraper with Crawlee...\n");

    // Load existing database
    const db = await loadPostingsDB();
    console.log(
      `📊 Current database has ${db.postings.length} postings from sources: ${db.metadata.sources.join(", ")}`,
    );
    console.log(`Last updated: ${db.metadata.lastUpdated}\n`);

    // TODO: Implement scraping
    console.log("📡 Scraping WikiCFP...");
    // const wikiCFPData = await scrapeWikiCFP();

    console.log("\n✅ Scraping completed");

    // TODO: Combine results and save
    // const allPostings = [
    //   ...wikiCFPData
    // ];

    // Save to temp JSON database
    // for (const posting of allPostings) {
    //   await addPosting(posting);
    // }

    // Then export to conferences format
    // const conferences = convertToConferences(allPostings);
    // await saveConferencesToFile('./scripts/data-aggregation/conferences-from-postings.json', conferences);

    console.log("📁 Database saved to conference-postings.json");
    console.log("📝 Ready to export to conferences-from-postings.json");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Uncaught error:", error);
  process.exit(1);
});
