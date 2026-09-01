import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const [manifestPath, buildRoot] = process.argv.slice(2);
if (!manifestPath || !buildRoot) throw new Error("Usage: node scripts/apply-experimental-import.mjs <manifest> <build-root>");

const entries = JSON.parse(await readFile(manifestPath, "utf8"));
if (!entries.length) throw new Error("Import manifest is empty");
for (const entry of entries) {
  if (!entry.fastStart || entry.outputAudioStreams !== 0 || entry.outputVideoCodec !== "h264" || entry.outputPixelFormat !== "yuv420p") {
    throw new Error(`${entry.id}: output validation is incomplete`);
  }
  // A 0.5-second cadence lands on a frame boundary; at 24 fps the measured
  // timestamp gap can be 0.52 seconds after container time-base rounding.
  if (entry.keyframeMaxGap > 0.53) throw new Error(`${entry.id}: keyframe gap ${entry.keyframeMaxGap}`);
}

const dataFiles = ["data/source-library-data.js", "data/source-library-youtube-data.js"];
const context = { window: {} };
vm.createContext(context);
for (const file of dataFiles) vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
const existing = context.window.SOURCE_LIBRARY || [];
const existingIds = new Set(existing.map((item) => String(item.id)));
const existingClips = new Set(existing.map((item) => item.clip));
const existingThumbs = new Set(existing.map((item) => item.thumb));

const metadata = entries.map((entry) => {
  if (existingIds.has(entry.id)) throw new Error(`Duplicate id: ${entry.id}`);
  if (existingClips.has(entry.outputFile)) throw new Error(`Duplicate clip: ${entry.outputFile}`);
  if (existingThumbs.has(entry.thumb)) throw new Error(`Duplicate thumb: ${entry.thumb}`);
  return {
    id: entry.id,
    title: entry.title,
    clip: entry.outputFile,
    thumb: entry.thumb,
    ...(entry.media ? { media: entry.media } : {}),
    source: `local:macbookpro/${entry.originalFile}`,
    ranges: [[0, entry.outputDuration]],
    theme: entry.theme,
    category: entry.category,
    keywords: entry.keywords,
  };
});

const targetDataPath = "data/source-library-youtube-data.js";
let sourceText = await readFile(targetDataPath, "utf8");
if (!/\n\]\);\s*$/.test(sourceText)) throw new Error(`${targetDataPath}: unexpected ending`);
const objectBlock = metadata.map((item) => JSON.stringify(item, null, 2)
  .split("\n").map((line) => `  ${line}`).join("\n"))
  .join(",\n");
sourceText = sourceText.replace(/\n\]\);\s*$/, `,\n${objectBlock}\n]);\n`);
await writeFile(targetDataPath, sourceText);

await mkdir("assets/thumbs", { recursive: true });
for (const entry of entries) {
  await copyFile(path.join(buildRoot, "thumbs", entry.thumb), path.join("assets/thumbs", entry.thumb));
}

const sanitized = entries.map(({ originalPath, ...entry }) => entry);
await writeFile(manifestPath, JSON.stringify(sanitized, null, 2) + "\n");
process.stdout.write(`Applied ${metadata.length} metadata entries and thumbnails\n`);
