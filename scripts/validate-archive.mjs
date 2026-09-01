import { access, readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

const network = process.argv.includes("--network");
const context = { window: {} };
createContext(context);
for (const file of ["data/source-library-data.js", "data/source-library-youtube-data.js"]) runInContext(await readFile(file, "utf8"), context);
const items = context.window.SOURCE_LIBRARY || [];
const errors = [];
const ids = new Set();
for (const item of items) {
  if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
  ids.add(item.id);
  if (!item.title || !item.clip || !item.thumb || !item.category) errors.push(`missing required metadata ${item.id}`);
  if (!Array.isArray(item.keywords) || item.keywords.length < 7) errors.push(`insufficient keywords ${item.id}`);
  if (Number(item.id) >= 275 && item.title.trim().split(/\s+/).length > 3) errors.push(`long display title ${item.id}`);
  try { await access(`assets/thumbs/${item.thumb}`); } catch { errors.push(`missing thumbnail ${item.id}: ${item.thumb}`); }
}
for (let id = 1; id <= items.length; id += 1) if (!ids.has(String(id)) && !ids.has(String(id).padStart(2, "0"))) errors.push(`missing numeric id ${id}`);

for (const file of ["data/experimental-import-manifest.json", "data/experimental-import-manifest-2.json"]) {
  for (const item of JSON.parse(await readFile(file, "utf8"))) {
    if (item.outputAudioStreams !== 0) errors.push(`audio stream present ${item.id}`);
    if (item.outputVideoCodec !== "h264") errors.push(`unexpected codec ${item.id}: ${item.outputVideoCodec}`);
    if (item.outputPixelFormat !== "yuv420p") errors.push(`unexpected pixel format ${item.id}: ${item.outputPixelFormat}`);
    if (item.fastStart !== true) errors.push(`fast start missing ${item.id}`);
    if (Number(item.keyframeMaxGap) > 0.65) errors.push(`keyframe gap too large ${item.id}: ${item.keyframeMaxGap}`);
    if (item.rangeHttpStatus !== 206) errors.push(`recorded Range validation failed ${item.id}`);
  }
}

if (network) {
  const sample = items.filter((_, index) => index % Math.max(1, Math.floor(items.length / 20)) === 0).slice(0, 20);
  for (const item of sample) {
    const root = item.media === "b2" ? "https://source-media-b2.oosu.dev/media/" : "https://source-media.oosu.dev/media/";
    const response = await fetch(root + encodeURIComponent(item.clip), { headers: { Range: "bytes=0-1023" } });
    if (response.status !== 206 || !response.headers.get("content-range")) errors.push(`live Range validation failed ${item.id}: ${response.status}`);
    await response.body?.cancel();
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ items: items.length, thumbnails: items.length, metadata: "valid", mediaManifest: "valid", networkSamples: network ? 20 : 0 }));
}
