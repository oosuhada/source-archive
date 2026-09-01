import { readFile, writeFile } from "node:fs/promises";

const firstId = 275;
const lastId = 402;
const dataPath = "data/source-library-youtube-data.js";
const manifestPath = "data/experimental-import-manifest.json";

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
for (let numericId = firstId; numericId <= lastId; numericId += 1) {
  const id = String(numericId);
  const bounds = objectBounds(data, `"id": "${id}"`);
  const object = data.slice(bounds.start, bounds.end);
  const revised = object.replace(/"category": "[^"]+"/, '"category": "Template"');
  if (object === revised) throw new Error(`${id}: category was not updated`);
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);
}
await writeFile(dataPath, data);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let manifestCount = 0;
for (const entry of manifest) {
  const numericId = Number(entry.id);
  if (numericId < firstId || numericId > lastId) continue;
  entry.category = "Template";
  manifestCount += 1;
}
if (manifestCount !== lastId - firstId + 1) {
  throw new Error(`Expected 128 manifest entries, found ${manifestCount}`);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

process.stdout.write(`Moved ${manifestCount} items (${firstId}-${lastId}) to Template\n`);
