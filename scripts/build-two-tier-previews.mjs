import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { createContext, runInContext } from "node:vm";

const run = promisify(execFile);
const [ffmpeg, outputRoot = "build/two-tier-previews"] = process.argv.slice(2);
if (!ffmpeg) throw new Error("Usage: node scripts/build-two-tier-previews.mjs <ffmpeg> [output-root]");
const roots = { r2: "https://source-media.oosu.dev/media/", b2: "https://source-media-b2.oosu.dev/media/" };
const localPreviewRoot = process.env.LOCAL_PREVIEW_ROOT;
const context = { window: {} };createContext(context);
for (const file of ["data/source-library-data.js", "data/source-library-youtube-data.js"]) runInContext(await readFile(file, "utf8"), context, { filename: file });
const entries = (context.window.SOURCE_LIBRARY || []).map((item) => {
  const stem = basename(item.clip, ".mp4");
  const file = `${stem}-preview.mp4`;
  return { id: item.id, file, micro: `${stem}-micro.mp4`, media: "b2", microMedia: "b2", input: localPreviewRoot ? join(localPreviewRoot, file) : `${roots[item.media || "r2"]}${encodeURIComponent(item.clip)}` };
}).sort((a, b) => Number(a.id) - Number(b.id));
const standardDir = join(outputRoot, "standard"), microDir = join(outputRoot, "micro");
await mkdir(standardDir, { recursive: true });await mkdir(microDir, { recursive: true });

async function encode(input, output, seconds, fps, crf, maxrate) {
  try { await stat(output); return; } catch {}
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await run(ffmpeg, ["-hide_banner", "-loglevel", "error", ...(localPreviewRoot ? ["-stream_loop", "-1"] : ["-rw_timeout", "30000000", "-ss", "0.2"]), "-i", input,
        "-t", String(seconds), "-an", "-vf", "scale=180:102", "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-maxrate", maxrate, "-bufsize", `${Number.parseInt(maxrate, 10) * 2}k`,
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-force_key_frames", "expr:gte(t,n_forced*0.5)", output], { maxBuffer: 8 * 1024 * 1024 });
      return;
    } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, attempt * 600)); }
  }
  throw lastError;
}
const concurrency = Math.max(1, Number(process.env.PREVIEW_CONCURRENCY || 6));let next = 0, finished = 0;
async function worker() {
  while (next < entries.length) {
    const entry = entries[next++];
    await encode(entry.input, join(microDir, entry.micro), 5, 12, 34, "250k");
    await encode(entry.input, join(standardDir, entry.file), 10, 15, 32, "350k");
    finished += 1;if (finished % 10 === 0 || finished === entries.length) console.log(`encoded ${finished}/${entries.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
await writeFile(join(outputRoot, "preview-manifest.json"), JSON.stringify(entries.map(({ input, ...entry }) => entry), null, 2) + "\n");
console.log(JSON.stringify({ encoded: entries.length, outputRoot }));
