import fs from "fs";
import path from "path";
import { Agent, setGlobalDispatcher } from "undici";

// Configure undici with longer timeouts for slow API responses
const agent = new Agent({
  headersTimeout: 900000, // 15 minutes for headers
  bodyTimeout: 900000, // 15 minutes for body
  keepAliveTimeout: 900000,
});
setGlobalDispatcher(agent);

const BASE_URL = "http://localhost:3000";
const EXAMPLE_POSTERS_DIR = path.join(process.cwd(), "example_posters");

const TEST_USER = {
  emailAddress: "rick@example.com",
  password: "12345678",
};

interface UploadResult {
  filename: string;
  success: boolean;
  posterId?: number;
  error?: string;
  duration?: number;
}

function getErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    // Node fetch errors have a 'cause' property with more details
    const cause = (error as Error & { cause?: Error }).cause;
    if (cause) {
      const code = (cause as Error & { code?: string }).code;
      if (code === "ECONNREFUSED") {
        return `Connection refused - is the server running at ${BASE_URL}?`;
      }
      if (code === "ENOTFOUND") {
        return `Host not found - check the URL: ${BASE_URL}`;
      }
      if (code === "ETIMEDOUT") {
        return "Connection timed out";
      }

      return `${cause.message}${code ? ` (${code})` : ""}`;
    }

    return error.message;
  }

  return "Unknown error";
}

async function login(): Promise<string> {
  console.log(`\n🔐 Logging in as ${TEST_USER.emailAddress}...`);
  console.log(`   Target: ${BASE_URL}/api/auth/login`);

  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(TEST_USER),
      redirect: "manual",
    });

    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error(`No session cookie returned. Status: ${response.status}`);
    }

    const sessionCookie = setCookie.split(";")[0];
    console.log("   ✅ Login successful\n");

    return sessionCookie;
  } catch (error) {
    throw new Error(`Login failed: ${getErrorDetails(error)}`);
  }
}

async function uploadPoster(
  filepath: string,
  sessionCookie: string,
  index: number,
  total: number,
): Promise<UploadResult> {
  const filename = path.basename(filepath);
  const fileSize = fs.statSync(filepath).size;
  const fileSizeKB = (fileSize / 1024).toFixed(1);

  console.log(
    `\n📤 [${index}/${total}] Uploading: ${filename} (${fileSizeKB} KB)`,
  );

  const fileBuffer = fs.readFileSync(filepath);
  const ext = path.extname(filename).toLowerCase();
  const mimeType =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
          ? "image/png"
          : "application/octet-stream";

  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const startTime = Date.now();

  try {
    console.log(`   ⏳ Sending to ${BASE_URL}/api/poster...`);
    const response = await fetch(`${BASE_URL}/api/poster`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
      },
      body: formData,
      signal: AbortSignal.timeout(600000), // 10 minute timeout
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Failed (${duration}s): HTTP ${response.status}`);
      console.log(`      Response: ${errorText.substring(0, 1000)}`);

      return {
        filename,
        success: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
        duration: parseFloat(duration),
      };
    }

    const data = (await response.json()) as { posterId: number };
    console.log(`   ✅ Success (${duration}s) -> posterId: ${data.posterId}`);

    return {
      filename,
      success: true,
      posterId: data.posterId,
      duration: parseFloat(duration),
    };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const errorMessage = getErrorDetails(error);
    console.log(`   ❌ Failed (${duration}s): ${errorMessage}`);

    return {
      filename,
      success: false,
      error: errorMessage,
      duration: parseFloat(duration),
    };
  }
}

async function main() {
  console.log("=".repeat(50));
  console.log("🧪 Poster Upload Test Script");
  console.log("=".repeat(50));

  // Check if example_posters directory exists
  if (!fs.existsSync(EXAMPLE_POSTERS_DIR)) {
    console.error(`❌ Directory not found: ${EXAMPLE_POSTERS_DIR}`);
    process.exit(1);
  }

  // Get all files from example_posters
  const files = fs
    .readdirSync(EXAMPLE_POSTERS_DIR)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();

      return [".pdf", ".jpg", ".jpeg", ".png"].includes(ext);
    })
    .map((file) => path.join(EXAMPLE_POSTERS_DIR, file));

  console.log(`\n📁 Found ${files.length} poster files to upload`);

  // Login to get session
  let sessionCookie: string;
  try {
    sessionCookie = await login();
  } catch (error) {
    console.error(`❌ Login failed: ${error}`);
    process.exit(1);
  }

  // Upload each poster sequentially
  const results: UploadResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const result = await uploadPoster(
      files[i],
      sessionCookie,
      i + 1,
      files.length,
    );
    results.push(result);
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 SUMMARY");
  console.log("=".repeat(50));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(`\n⏱️  Total time: ${totalDuration.toFixed(1)}s`);
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);

  if (successful.length > 0) {
    console.log("\n📋 Uploaded posters:");
    for (const r of successful) {
      console.log(
        `   ✓ ${r.filename} -> posterId: ${r.posterId} (${r.duration}s)`,
      );
    }
  }

  if (failed.length > 0) {
    console.log("\n⚠️  Failed uploads:");
    for (const r of failed) {
      console.log(
        `   ✗ ${r.filename}: ${JSON.stringify(r.error)} (${r.duration}s)`,
      );
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📝 Review results at: http://localhost:3000/dashboard");
  console.log("=".repeat(50) + "\n");
}

main().catch(console.error);
