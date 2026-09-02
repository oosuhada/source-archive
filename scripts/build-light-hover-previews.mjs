import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { promisify } from "node:util";
import { createContext, runInContext } from "node:vm";

const run = promisify(execFile);
const [ffmpeg, outputRoot = "build/light-hover-previews"] = process.argv.slice(2);
if (!ffmpeg) throw new Error("Usage: node scripts/build-light-hover-previews.mjs <ffmpeg> [output-root]");

const context = { window: {} };
createContext(context);
for (const file of ["data/source-library-data.js", "data/source-library-youtube-data.js"]) {
  runInContext(await readFile(file, "utf8"), context, { filename: file });
}
const items = context.window.SOURCE_LIBRARY || [];
const existing = JSON.parse(await readFile("data/preview-manifest.json", "utf8"));
const existingById = new Map(existing.map((entry) => [entry.id, entry]));
const mediaRoot = "https://source-media-b2.oosu.dev/media/";
const previewRoot = "https://source-media-b2.oosu.dev/previews/";
const mediaDir = join(outputRoot, "media");
await mkdir(mediaDir, { recursive: true });

const entries = items.map((item) => {
  const previous = existingById.get(item.id);
  const file = previous?.file || `${basename(item.clip, ".mp4")}-preview.mp4`;
  return {
    id: item.id,
    file,
    media: "b2",
    input: previous ? `${previewRoot}${encodeURIComponent(previous.file)}` : `${mediaRoot}${encodeURIComponent(item.clip)}`,
  };
}).sort((a, b) => Number(a.id) - Number(b.id));

const concurrency = Math.max(1, Number(process.env.PREVIEW_CONCURRENCY || 3));
let next = 0, finished = 0;
async function build(entry) {
  const output = join(mediaDir, entry.file);
  try { await stat(output); return; } catch {}
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await run(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-rw_timeout", "30000000", "-ss", "0.2", "-i", entry.input,
        "-t", "2.5", "-an", "-vf", "scale=360:202", "-r", "24",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-maxrate", "450k", "-bufsize", "900k",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-force_key_frames", "expr:gte(t,n_forced*0.5)", output,
      ], { maxBuffer: 8 * 1024 * 1024 });
      return;
    } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, attempt * 600)); }
  }
  throw lastError;
}
async function worker() {
  while (next < entries.length) {
    const entry = entries[next++];
    await build(entry);
    finished += 1;
    if (finished % 20 === 0 || finished === entries.length) console.log(`encoded ${finished}/${entries.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
await writeFile(join(outputRoot, "preview-manifest.json"), JSON.stringify(entries.map(({ id, file, media }) => ({ id, file, media })), null, 2) + "\n");
console.log(JSON.stringify({ encoded: entries.length, outputRoot }));
