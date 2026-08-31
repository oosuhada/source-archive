import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error("Usage: node scripts/revise-footage-import.mjs <build-root>");

const removedIds = new Set(["454", "469", "470"]);
const crops = new Map([
  ["438", { outputFile: "438_abstract-view-of-glittery-black-and-red-liquid-cropped.mp4", width: 1920, height: 900, crop: "1920:900:0:90" }],
  ["440", { outputFile: "440_pink-and-red-waves-of-color-mixing-cropped.mp4", width: 1920, height: 900, crop: "1920:900:0:90" }],
  ["456", { outputFile: "456_dirtbikes-in-smoke-in-front-of-headlights-at-night-cropped.mp4", width: 1920, height: 816, crop: "1920:816:0:132" }],
  ["464", { outputFile: "464_seen-from-under-the-stream-the-man-squats-on-the-rocks-and-drinks-water-cropped.mp4", width: 1920, height: 800, crop: "1920:800:0:140" }],
]);

function objectBounds(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing marker: ${marker}`);
  const start = source.lastIndexOf("{", markerAt);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return { start, end: index + 1 };
  }
  throw new Error(`Unterminated object: ${marker}`);
}

function removeObject(source, id) {
  let { start, end } = objectBounds(source, `"id": "${id}"`);
  let cursor = end;
  while (/\s/.test(source[cursor])) cursor += 1;
  if (source[cursor] === ",") {
    end = cursor + 1;
  } else {
    cursor = start - 1;
    while (/\s/.test(source[cursor])) cursor -= 1;
    if (source[cursor] === ",") start = cursor;
  }
  return source.slice(0, start) + source.slice(end);
}

const manifestPath = "data/experimental-import-manifest.json";
let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest = manifest.filter((entry) => !removedIds.has(entry.id));
for (const entry of manifest) {
  const revision = crops.get(entry.id);
  if (!revision) continue;
  entry.supersedesOutputFile = entry.outputFile;
  entry.outputFile = revision.outputFile;
  entry.outputWidth = revision.width;
  entry.outputHeight = revision.height;
  entry.cropApplied = revision.crop;
  entry.outputBytes = (await stat(path.join(buildRoot, "media", revision.outputFile))).size;
  entry.cdnUrl = `https://source-media.oosu.dev/media/${revision.outputFile}`;
  entry.cdnHttpStatus = 200;
  entry.rangeHttpStatus = 206;
  await copyFile(path.join(buildRoot, "thumbs", entry.thumb), path.join("assets/thumbs", entry.thumb));
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const dataPath = "data/source-library-youtube-data.js";
let data = await readFile(dataPath, "utf8");
for (const id of removedIds) data = removeObject(data, id);
for (const [id, revision] of crops) {
  const bounds = objectBounds(data, `"id": "${id}"`);
  const object = data.slice(bounds.start, bounds.end);
  const revised = object.replace(/"clip": "[^"]+"/, `"clip": "${revision.outputFile}"`);
  if (object === revised) throw new Error(`${id}: clip was not updated`);
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);
}
await writeFile(dataPath, data);

process.stdout.write(`Removed ${removedIds.size} items and cropped ${crops.size} items\n`);
