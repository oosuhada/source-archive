import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createContext, runInContext } from "node:vm";

const revisionRoot = process.argv[2];
if (!revisionRoot) throw new Error("Usage: node scripts/compact-renumbered-gaps.mjs <revision-root>");

const gaps = [450, 465, 466];
const dataPath = "data/source-library-youtube-data.js";
const manifestPaths = ["data/experimental-import-manifest.json", "data/experimental-import-manifest-2.json"];
const stagingMedia = path.join(revisionRoot, "renumbered-media");

function compactId(id) {
  return id - gaps.filter((gap) => gap < id).length;
}

function renamedFile(file, oldId, newId) {
  const prefix = `${oldId}_`;
  if (!file.startsWith(prefix)) throw new Error(`${file}: expected prefix ${prefix}`);
  return `${newId}_${file.slice(prefix.length)}`;
}

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

let data = await readFile(dataPath, "utf8");
const context = { window: {} };
createContext(context);
runInContext(data, context);
const items = context.window.SOURCE_LIBRARY;

for (const item of items.filter((entry) => Number(entry.id) > gaps[0]).sort((a, b) => Number(b.id) - Number(a.id))) {
  const oldId = Number(item.id);
  const newId = compactId(oldId);
  const newClip = renamedFile(item.clip, oldId, newId);
  const newThumb = renamedFile(item.thumb, oldId, newId);
  const bounds = objectBounds(data, `"id": "${oldId}"`);
  const object = data.slice(bounds.start, bounds.end);
  const revised = object
    .replace(`"id": "${oldId}"`, `"id": "${newId}"`)
    .replace(`"clip": "${item.clip}"`, `"clip": "${newClip}"`)
    .replace(`"thumb": "${item.thumb}"`, `"thumb": "${newThumb}"`);
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);
  await rename(path.join(stagingMedia, item.clip), path.join(stagingMedia, newClip));
  await rename(path.join("assets/thumbs", item.thumb), path.join("assets/thumbs", newThumb));
}
await writeFile(dataPath, data);

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const entry of manifest) {
    const oldId = Number(entry.id);
    if (oldId <= gaps[0]) continue;
    const newId = compactId(oldId);
    entry.id = String(newId);
    entry.outputFile = renamedFile(entry.outputFile, oldId, newId);
    entry.thumb = renamedFile(entry.thumb, oldId, newId);
    entry.cdnUrl = `https://source-media-b2.oosu.dev/media/${entry.outputFile}`;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

const mapPath = path.join(revisionRoot, "renumber-map.json");
const map = JSON.parse(await readFile(mapPath, "utf8"));
for (const record of map) {
  const currentId = Number(record.newId);
  if (currentId <= gaps[0]) continue;
  const finalId = compactId(currentId);
  record.newId = String(finalId);
  record.newClip = renamedFile(record.newClip, currentId, finalId);
  record.newThumb = renamedFile(record.newThumb, currentId, finalId);
}
await writeFile(mapPath, JSON.stringify(map, null, 2) + "\n");
process.stdout.write(JSON.stringify({ compactedGaps: gaps, newMaxId: 644 }) + "\n");
