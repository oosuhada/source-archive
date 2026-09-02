import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { createContext, runInContext } from "node:vm";

const run = promisify(execFile);
const [outputRoot = "build/r2-hover-previews"] = process.argv.slice(2);
const ffmpeg = process.env.FFMPEG;
if (!ffmpeg) throw new Error("FFMPEG is required");

const context = { window: {} };
createContext(context);
for (const file of ["data/source-library-data.js", "data/source-library-youtube-data.js"]) {
  runInContext(await readFile(file, "utf8"), context, { filename: file });
}
const existing = JSON.parse(await readFile("data/preview-manifest.json", "utf8"));
const existingIds = new Set(existing.map((entry) => entry.id));
const entries = (context.window.SOURCE_LIBRARY || [])
  .filter((item) => (item.media || "r2") === "r2" && !existingIds.has(item.id))
  .sort((a, b) => Number(a.id) - Number(b.id));

await mkdir(outputRoot, { recursive: true });
const generated = [];
for (const [index, entry] of entries.entries()) {
  const outputFile = `${basename(entry.clip, ".mp4")}-preview.mp4`;
  const output = join(outputRoot, outputFile);
  try {
    await stat(output);
  } catch {
    const input = `https://source-media.oosu.dev/media/${encodeURIComponent(entry.clip)}`;
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-rw_timeout", "30000000", "-ss", "0.4", "-i", input,
      "-t", "4", "-an", "-vf", "scale=-2:min(480\\,ih)", "-c:v", "libx264", "-preset", "medium",
      "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-force_key_frames", "expr:gte(t,n_forced*0.5)", output,
    ], { maxBuffer: 8 * 1024 * 1024 });
  }
  generated.push({ id: entry.id, file: outputFile, media: "b2" });
  if ((index + 1) % 10 === 0 || index + 1 === entries.length) console.log(`generated ${index + 1}/${entries.length}`);
}
await writeFile(join(outputRoot, "preview-manifest.json"), JSON.stringify(generated, null, 2) + "\n");
console.log(JSON.stringify({ generated: generated.length, outputRoot }));
