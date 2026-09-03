import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

const files = ["data/source-library-data.js", "data/source-library-youtube-data.js"];
const context = { window: {} };
createContext(context);
for (const file of files) runInContext(await readFile(file, "utf8"), context);

const aliases = {
  "Food / Drink": "Food", "Nature / Land": "Nature",
  "Experimental / Material / Object": "Experimental",
  "Sky / Space / Weather": "Nature", Water: "Water", "Work / Tech": "Business",
  "People / Culture": "People", "Travel / City / Architecture": "Travel",
  "Sport / Physical": "Sport",
};
const cosmosIds = new Set(["12", "13", "25", "111", "112", "138", "140"]);
const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const documents = context.window.SOURCE_LIBRARY.map((item) => {
  const category = cosmosIds.has(item.id) ? "Cosmos" : aliases[item.category] || item.category || "Experimental";
  const terms = [...new Set([item.title, category, ...(item.keywords || [])].flatMap((value) => normalize(value).split(/\s+/)).filter(Boolean))];
  return { id: item.id, title: normalize(item.title), category: normalize(category), terms };
});
const payload = JSON.stringify({ schema: 1, documents });
const previewManifest = await readFile("data/preview-manifest.json", "utf8");
const previews = JSON.parse(previewManifest);
const applicationSources = await Promise.all(["index.html", "search-worker.js", "performance-dashboard.js", "styles/source-library-detail.css", "data/hls-boot-pack-manifest.js"].map((file) => readFile(file, "utf8")));
const thumbnailSources = await Promise.all(context.window.SOURCE_LIBRARY.flatMap((item) => [
  readFile(`assets/thumbs-low/${item.thumb}`),
  readFile(`assets/thumbs-360/${item.thumb}`),
]));
const versionHash = createHash("sha256").update(payload).update(previewManifest);
for (const source of applicationSources) versionHash.update(source);
for (const source of thumbnailSources) versionHash.update(source);
const version = versionHash.digest("hex").slice(0, 12);
await writeFile("data/search-index.json", payload + "\n");
await writeFile("data/build-meta.js", `window.SOURCE_ARCHIVE_BUILD=${JSON.stringify({ version, items: documents.length })};\n`);
await writeFile("data/preview-manifest.js", `window.SOURCE_ARCHIVE_PREVIEWS=${JSON.stringify(previews)};\n`);
process.stdout.write(JSON.stringify({ version, documents: documents.length }) + "\n");
