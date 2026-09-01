import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const [probePath, sourceManifestPath, outputPath] = process.argv.slice(2);
if (!probePath || !sourceManifestPath || !outputPath) {
  throw new Error("Usage: node scripts/build-footage-import.mjs <probe-report> <source-manifest> <output-manifest>");
}

const probes = JSON.parse(await readFile(probePath, "utf8"));
const sources = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const previousImports = JSON.parse(await readFile("data/experimental-import-manifest.json", "utf8"));
const context = { window: {} };
vm.createContext(context);
for (const file of ["data/source-library-data.js", "data/source-library-youtube-data.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}
const library = context.window.SOURCE_LIBRARY || [];
const startId = Math.max(...library.map((item) => Number(item.id))) + 1;
const existingPages = new Set(previousImports.flatMap((item) => [item.originalPage, ...(item.originalPages || [])]).filter(Boolean));
const usedSlugs = new Set(library.map((item) => path.basename(item.clip, path.extname(item.clip)).replace(/^\d+_/, "")));

function normalize(value) {
  return path.basename(String(value), path.extname(String(value)))
    .replace(/^\d+[-_]?/, "")
    .replace(/-1080p$/i, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const sourceGroups = new Map();
for (const source of sources) {
  const key = normalize(source.name);
  if (!sourceGroups.has(key)) sourceGroups.set(key, []);
  sourceGroups.get(key).push(source);
}
const probeGroups = new Map();
for (const probe of probes) {
  const key = normalize(probe.originalFile);
  if (!probeGroups.has(key)) probeGroups.set(key, []);
  probeGroups.get(key).push(probe);
}
for (const group of probeGroups.values()) group.sort((a, b) => a.originalFile.localeCompare(b.originalFile, undefined, { numeric: true }));

const sourceByClipId = new Map();
for (const source of sources) {
  const id = source.page?.match(/\/(\d+)$/)?.[1];
  if (id) sourceByClipId.set(id, source);
}

const selected = [];
for (const [key, group] of probeGroups) {
  const candidates = sourceGroups.get(key) || [];
  for (let index = 0; index < group.length; index += 1) {
    const probe = group[index];
    const direct = candidates[index];
    const ids = probe.originalFile.match(/\d{4,}/g) || [];
    const related = [...new Map(ids.map((id) => sourceByClipId.get(id)).filter(Boolean).map((item) => [item.page, item])).values()];
    const pages = direct?.page ? [direct.page] : related.map((item) => item.page);
    if (pages.some((page) => existingPages.has(page))) continue;
    selected.push({ probe, source: direct || related[0], pages });
  }
}
selected.sort((a, b) => a.probe.originalFile.localeCompare(b.probe.originalFile, undefined, { numeric: true }));

function uniqueSlug(fileName) {
  const base = normalize(fileName).replace(/-combined$/, "") || "untitled";
  let slug = base;
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
  usedSlugs.add(slug);
  return slug;
}
function title(value) {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const entries = selected.map(({ probe, source, pages }, index) => {
  const id = String(startId + index);
  const slug = uniqueSlug(probe.originalFile);
  return {
    id,
    title: title(source?.name || slug),
    originalFile: probe.originalFile,
    originalPath: probe.filePath,
    originalPage: pages[0] || null,
    ...(pages.length > 1 ? { originalPages: pages } : {}),
    slug,
    outputFile: `${id}_${slug}.mp4`,
    thumb: `${id}_${slug}.jpg`,
    duration: Number(probe.duration.toFixed(3)),
    width: probe.width,
    height: probe.height,
    fps: Number(probe.fps.toFixed(3)),
    videoCodec: probe.videoCodec,
    audioStreamsOriginal: probe.audioStreamsOriginal,
    kind: "footage",
    category: "Experimental / Material / Object",
    theme: "06",
    keywords: [...new Set([...slug.split("-").filter((word) => word.length > 2 && !/^\d+$/.test(word)), "experimental"])].slice(0, 10),
  };
});

await writeFile(outputPath, JSON.stringify(entries, null, 2) + "\n");
process.stdout.write(`${entries.length} entries: ${entries[0]?.id}-${entries.at(-1)?.id}\n`);
