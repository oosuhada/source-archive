import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const [buildOne, buildTwo, revisionRoot] = process.argv.slice(2);
if (!buildOne || !buildTwo || !revisionRoot) {
  throw new Error("Usage: node scripts/revise-delete-renumber-archive.mjs <build-one> <build-two> <revision-root>");
}

const removedIds = new Set([430, 437, 441, 445]);
const dataPath = "data/source-library-youtube-data.js";
const manifestPaths = ["data/experimental-import-manifest.json", "data/experimental-import-manifest-2.json"];
const stagingMedia = path.join(revisionRoot, "renumbered-media");
const deletionManifestPath = path.join(revisionRoot, "old-cloud-objects-to-delete.json");
await mkdir(stagingMedia, { recursive: true });

function shiftedId(oldId) {
  let shift = 0;
  for (const removedId of removedIds) if (removedId < oldId) shift += 1;
  return oldId - shift;
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

function removeObject(source, id) {
  let { start, end } = objectBounds(source, `"id": "${id}"`);
  let cursor = end;
  while (/\s/.test(source[cursor])) cursor += 1;
  if (source[cursor] === ",") end = cursor + 1;
  else {
    cursor = start - 1;
    while (/\s/.test(source[cursor])) cursor -= 1;
    if (source[cursor] === ",") start = cursor;
  }
  return source.slice(0, start) + source.slice(end);
}

function parseLibrary(source) {
  const context = { window: {} };
  return import("node:vm").then(({ createContext, runInContext }) => {
    createContext(context);
    runInContext(source, context);
    return context.window.SOURCE_LIBRARY;
  });
}

let data = await readFile(dataPath, "utf8");
const originalItems = await parseLibrary(data);
const originalsById = new Map(originalItems.map((item) => [Number(item.id), item]));
const cloudDeletes = [];
const renameRecords = [];

for (const removedId of [...removedIds].sort((a, b) => a - b)) {
  const item = originalsById.get(removedId);
  cloudDeletes.push({ id: String(removedId), media: item.media || "r2", clip: item.clip, reason: "removed" });
  data = removeObject(data, String(removedId));
}

for (const oldId of [...originalsById.keys()].filter((id) => id > 430 && !removedIds.has(id)).sort((a, b) => b - a)) {
  const item = originalsById.get(oldId);
  const newId = shiftedId(oldId);
  const newClip = renamedFile(item.clip, oldId, newId);
  const newThumb = renamedFile(item.thumb, oldId, newId);
  const bounds = objectBounds(data, `"id": "${oldId}"`);
  const object = data.slice(bounds.start, bounds.end);
  let revised = object
    .replace(`"id": "${oldId}"`, `"id": "${newId}"`)
    .replace(`"clip": "${item.clip}"`, `"clip": "${newClip}"`)
    .replace(`"thumb": "${item.thumb}"`, `"thumb": "${newThumb}"`);
  if (/"media": "[^"]+"/.test(revised)) revised = revised.replace(/"media": "[^"]+"/, '"media": "b2"');
  else revised = revised.replace(/("thumb": "[^"]+",)/, '$1\n    "media": "b2",');
  if ([480, 481, 482].includes(oldId)) revised = revised.replace(/"category": "[^"]+"/, '"category": "Cosmos"');
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);

  const sourceCandidates = [path.join(buildTwo, "media", item.clip), path.join(buildOne, "media", item.clip)];
  let sourceMedia;
  for (const candidate of sourceCandidates) {
    try { await stat(candidate); sourceMedia = candidate; break; } catch {}
  }
  if (!sourceMedia) throw new Error(`${oldId}: local media missing for ${item.clip}`);
  await copyFile(sourceMedia, path.join(stagingMedia, newClip));
  await copyFile(path.join("assets/thumbs", item.thumb), path.join("assets/thumbs", newThumb));
  cloudDeletes.push({ id: String(oldId), media: item.media || "r2", clip: item.clip, reason: "renumbered" });
  renameRecords.push({ oldId: String(oldId), newId: String(newId), oldClip: item.clip, newClip, oldThumb: item.thumb, newThumb });
}

const specialRevisions = new Map([
  [265, {
    clip: "265_fireworks-revised.mp4",
    thumb: "265_fireworks-revised.jpg",
    source: "stock:mixkit+artlist/6041708",
    ranges: [[0, 42.334]],
    mediaSource: path.join(revisionRoot, "media", "265_fireworks-revised.mp4"),
    thumbSource: path.join(revisionRoot, "analysis", "265_fireworks-revised.jpg"),
  }],
  [285, {
    clip: "285_film-titles-cropped.mp4",
    thumb: "285_film-titles-cropped.jpg",
    source: "local:macbookpro/11-film-titles.ts",
    ranges: [[0, 110.067]],
    mediaSource: path.join(revisionRoot, "media", "285_film-titles-cropped.mp4"),
    thumbSource: path.join(revisionRoot, "analysis", "285_film-titles-cropped.jpg"),
  }],
]);

for (const [id, revision] of specialRevisions) {
  const item = originalsById.get(id);
  const bounds = objectBounds(data, `"id": "${id}"`);
  const object = data.slice(bounds.start, bounds.end);
  let revised = object
    .replace(`"clip": "${item.clip}"`, `"clip": "${revision.clip}"`)
    .replace(`"thumb": "${item.thumb}"`, `"thumb": "${revision.thumb}"`)
    .replace(/"source": "[^"]+"/, `"source": "${revision.source}"`)
    .replace(/"ranges": \[[\s\S]*?\],\n\s*"theme"/, `"ranges": ${JSON.stringify(revision.ranges)},\n    "theme"`);
  if (/"media": "[^"]+"/.test(revised)) revised = revised.replace(/"media": "[^"]+"/, '"media": "b2"');
  else revised = revised.replace(/("thumb": "[^"]+",)/, '$1\n    "media": "b2",');
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);
  await copyFile(revision.mediaSource, path.join(stagingMedia, revision.clip));
  await copyFile(revision.thumbSource, path.join("assets/thumbs", revision.thumb));
  cloudDeletes.push({ id: String(id), media: item.media || "r2", clip: item.clip, reason: "revised" });
}

await writeFile(dataPath, data);

for (const manifestPath of manifestPaths) {
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest = manifest.filter((entry) => !removedIds.has(Number(entry.id)));
  for (const entry of manifest) {
    const oldId = Number(entry.id);
    if (oldId > 430) {
      const newId = shiftedId(oldId);
      entry.id = String(newId);
      entry.outputFile = renamedFile(entry.outputFile, oldId, newId);
      entry.thumb = renamedFile(entry.thumb, oldId, newId);
      entry.media = "b2";
      entry.cdnUrl = `https://source-media-b2.oosu.dev/media/${entry.outputFile}`;
      if ([480, 481, 482].includes(oldId)) entry.category = "Cosmos";
    }
    if (oldId === 285) {
      entry.supersedesOutputFile = entry.outputFile;
      entry.outputFile = specialRevisions.get(285).clip;
      entry.thumb = specialRevisions.get(285).thumb;
      entry.cropApplied = "1920:912:0:80";
      entry.outputWidth = 1920;
      entry.outputHeight = 912;
      entry.outputDuration = 110.067;
      entry.outputBytes = (await stat(specialRevisions.get(285).mediaSource)).size;
      entry.media = "b2";
      entry.cdnUrl = `https://source-media-b2.oosu.dev/media/${entry.outputFile}`;
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

for (const record of renameRecords) {
  await unlink(path.join("assets/thumbs", record.oldThumb));
}
for (const id of removedIds) {
  const item = originalsById.get(id);
  await unlink(path.join("assets/thumbs", item.thumb));
}
for (const [id] of specialRevisions) {
  await unlink(path.join("assets/thumbs", originalsById.get(id).thumb));
}

await writeFile(deletionManifestPath, JSON.stringify(cloudDeletes, null, 2) + "\n");
await writeFile(path.join(revisionRoot, "renumber-map.json"), JSON.stringify(renameRecords, null, 2) + "\n");
process.stdout.write(JSON.stringify({ removed: removedIds.size, renumbered: renameRecords.length, staged: renameRecords.length + specialRevisions.size, newMaxId: 647 }) + "\n");
