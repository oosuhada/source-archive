import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const [sourceRoot, outputRoot = "build/hover-previews"] = process.argv.slice(2);
const ffmpeg = process.env.FFMPEG;
if (!sourceRoot || !ffmpeg) throw new Error("Usage: FFMPEG=/path/to/ffmpeg node scripts/build-hover-previews.mjs <source-root> [output-root]");
const manifests = ["data/experimental-import-manifest.json", "data/experimental-import-manifest-2.json"];
const entries = (await Promise.all(manifests.map(async (file) => JSON.parse(await readFile(file, "utf8"))))).flat();
await mkdir(outputRoot, { recursive: true });
const previews = [];
for (const entry of entries) {
  const candidates = [entry.outputFile, entry.originalFile].filter(Boolean).map((file) => join(sourceRoot, file));
  let input;
  for (const candidate of candidates) { try { await access(candidate); input = candidate; break; } catch {} }
  if (!input) continue;
  const outputFile = basename(entry.outputFile, ".mp4") + "-preview.mp4";
  const output = join(outputRoot, outputFile);
  try {
    await run(ffmpeg, ["-y", "-i", input, "-t", "4", "-an", "-vf", "scale='min(854,iw)':-2", "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-force_key_frames", "expr:gte(t,n_forced*0.5)", output], { maxBuffer: 8 * 1024 * 1024 });
    previews.push({ id: entry.id, file: outputFile, media: entry.media || "r2" });
  } catch (error) { throw new Error(`Preview failed for ${entry.id}: ${error.stderr || error.message}`); }
}
await writeFile(join(outputRoot, "preview-manifest.json"), JSON.stringify(previews, null, 2) + "\n");
console.log(JSON.stringify({ generated: previews.length, outputRoot }));
