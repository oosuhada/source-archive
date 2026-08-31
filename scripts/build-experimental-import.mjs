import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [probePath, templateManifestPath, footageManifestPath, outputPath = "data/experimental-import-manifest.json"] = process.argv.slice(2);
if (!probePath || !templateManifestPath || !footageManifestPath) {
  throw new Error("Usage: node scripts/build-experimental-import.mjs <probe-report> <template-manifest> <footage-manifest> [output]");
}

const probes = JSON.parse(await readFile(probePath, "utf8"));
const templateManifest = JSON.parse(await readFile(templateManifestPath, "utf8"));
const footageManifest = JSON.parse(await readFile(footageManifestPath, "utf8"));
const sourceByFile = new Map([...templateManifest, ...footageManifest].map((item) => [item.fileName, item]));

const selected = probes
  .filter((item) => item.kind === "template" || (item.kind === "footage" && item.landscape))
  .sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "template" ? -1 : 1;
    return a.originalFile.localeCompare(b.originalFile, undefined, { numeric: true });
  });

const usedSlugs = new Set();
function baseSlug(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/^\d+[-_]?/, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

function uniqueSlug(fileName) {
  const base = baseSlug(fileName);
  let slug = base;
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
  usedSlugs.add(slug);
  return slug;
}

function titleFrom(source, slug) {
  const candidate = source?.name || slug.replace(/-/g, " ");
  return candidate.replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function keywordsFrom(slug) {
  const words = slug.split("-").filter((word) => word.length > 2 && !/^\d+$/.test(word));
  return [...new Set([...words, "experimental"])].slice(0, 10);
}

const entries = selected.map((item, index) => {
  const id = String(275 + index);
  const slug = uniqueSlug(item.originalFile);
  const source = sourceByFile.get(item.originalFile);
  return {
    id,
    title: titleFrom(source, slug),
    originalFile: item.originalFile,
    originalPath: item.filePath,
    originalPage: source?.page || null,
    slug,
    outputFile: `${id}_${slug}.mp4`,
    thumb: `${id}_${slug}.jpg`,
    duration: Number(item.duration.toFixed(3)),
    width: item.width,
    height: item.height,
    fps: Number(item.fps.toFixed(3)),
    videoCodec: item.videoCodec,
    audioStreamsOriginal: item.audioStreamsOriginal,
    kind: item.kind,
    category: "Experimental / Material / Object",
    theme: "06",
    keywords: keywordsFrom(slug),
  };
});

if (entries.length !== 200) throw new Error(`Expected 200 selected sources, found ${entries.length}`);
await writeFile(outputPath, JSON.stringify(entries, null, 2) + "\n");
process.stdout.write(`${entries.length} entries: ${entries[0].id}-${entries.at(-1).id}\n`);
