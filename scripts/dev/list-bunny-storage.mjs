/**
 * List folder structure in Bunny private storage (HTTP API).
 *
 * Usage:
 *   node scripts/dev/list-bunny-storage.mjs
 *   node scripts/dev/list-bunny-storage.mjs --prefix posters/d
 *   node scripts/dev/list-bunny-storage.mjs --prefix bulk-imports/d --depth 5
 *   node scripts/dev/list-bunny-storage.mjs --json
 *
 * Env: NUXT_BUNNY_PRIVATE_STORAGE, NUXT_BUNNY_PRIVATE_STORAGE_KEY
 */
import "dotenv/config";

function env(name) {
  const raw = process.env[name] ?? "";
  return raw.replace(/^"|"$/g, "").trim();
}

function parseArgs(argv) {
  const out = { prefix: "", depth: 4, json: false, maxFiles: 500 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--prefix" && argv[i + 1]) {
      out.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    } else if (arg === "--depth" && argv[i + 1]) {
      out.depth = Math.max(1, Number.parseInt(argv[++i], 10) || 4);
    } else if (arg === "--max-files" && argv[i + 1]) {
      out.maxFiles = Math.max(1, Number.parseInt(argv[++i], 10) || 500);
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`List Bunny storage tree (private zone).

Options:
  --prefix <path>     Start under this path (e.g. posters/d, bulk-imports/d)
  --depth <n>         Max directory depth from prefix (default: 4)
  --max-files <n>     Stop after listing this many files (default: 500)
  --json              Print JSON tree instead of ASCII
`);
      process.exit(0);
    }
  }
  return out;
}

const base = env("NUXT_BUNNY_PRIVATE_STORAGE").replace(/\/$/, "");
const key = env("NUXT_BUNNY_PRIVATE_STORAGE_KEY");

if (!base || !key) {
  console.error(
    "Set NUXT_BUNNY_PRIVATE_STORAGE and NUXT_BUNNY_PRIVATE_STORAGE_KEY in .env",
  );
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));

/** @type {{ name: string, path: string, kind: 'dir' | 'file', size?: number, children?: unknown[] }} */
async function listPath(relativePath, depthLeft, stats) {
  const normalized = relativePath.replace(/^\/+|\/+$/g, "");
  const listUrl = normalized ? `${base}/${normalized}/` : `${base}/`;

  const res = await fetch(listUrl, {
    method: "GET",
    headers: { AccessKey: key, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `List failed ${res.status} ${res.statusText} for ${listUrl}\n${body.slice(0, 300)}`,
    );
  }

  const entries = await res.json();
  if (!Array.isArray(entries)) {
    throw new Error(`Unexpected list response (not an array) at ${listUrl}`);
  }

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    const name = entry.ObjectName ?? entry.objectName;
    if (!name) continue;

    const childPath = normalized ? `${normalized}/${name}` : name;
    const isDir = Boolean(entry.IsDirectory ?? entry.isDirectory);

    if (isDir) {
      stats.dirCount += 1;
      let children = [];
      if (depthLeft > 0) {
        const subtree = await listPath(childPath, depthLeft - 1, stats);
        children = subtree.children ?? [];
      }
      dirs.push({
        name,
        path: childPath,
        kind: "dir",
        children,
      });
    } else {
      stats.fileCount += 1;
      if (stats.fileCount > options.maxFiles) {
        stats.truncated = true;
        continue;
      }
      const length = entry.Length ?? entry.length ?? 0;
      files.push({
        name,
        path: childPath,
        kind: "file",
        size: length,
      });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return {
    name: normalized ? normalized.split("/").pop() : "(root)",
    path: normalized || "",
    kind: "dir",
    children: [...dirs, ...files],
  };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function printTree(node, indent = "") {
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const last = i === children.length - 1;
    const branch = last ? "└── " : "├── ";
    const nextIndent = indent + (last ? "    " : "│   ");

    if (child.kind === "dir") {
      console.log(`${indent}${branch}${child.name}/`);
      printTree(child, nextIndent);
    } else {
      const size = child.size != null ? ` (${formatBytes(child.size)})` : "";
      console.log(`${indent}${branch}${child.name}${size}`);
    }
  }
}

const stats = { fileCount: 0, dirCount: 0, truncated: false };

console.log(`Zone base: ${base}`);
console.log(
  `Listing: ${options.prefix || "(root)"} (depth ≤ ${options.depth})\n`,
);

try {
  const tree = await listPath(options.prefix, options.depth, stats);

  if (options.json) {
    console.log(JSON.stringify({ tree, stats }, null, 2));
  } else {
    const label = options.prefix || "(root)";
    console.log(`${label}/`);
    printTree(tree);
    console.log("");
    console.log(
      `Directories: ${stats.dirCount}, files: ${stats.fileCount}${stats.truncated ? " (truncated by --max-files)" : ""}`,
    );
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
