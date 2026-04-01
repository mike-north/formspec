import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

async function* walkMarkdownFiles(entryPath) {
  const entryStat = await stat(entryPath);
  if (entryStat.isDirectory()) {
    for (const child of await readdir(entryPath)) {
      yield* walkMarkdownFiles(path.join(entryPath, child));
    }
    return;
  }

  if (entryPath.endsWith(".md")) {
    yield entryPath;
  }
}

async function normalizeFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const normalized = source.replace(/\r\n/g, "\n");
  if (normalized !== source) {
    await writeFile(filePath, normalized, "utf8");
  }
}

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Usage: node ../../scripts/normalize-generated-markdown.mjs <path> [...paths]");
  process.exit(1);
}

for (const target of targets) {
  for await (const filePath of walkMarkdownFiles(target)) {
    await normalizeFile(filePath);
  }
}
