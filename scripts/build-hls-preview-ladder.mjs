import { execFile } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const [ffmpeg, inputRoot = "build/two-tier-previews-loop-180/standard", outputRoot = "build/hls-preview-ladder-ts"] = process.argv.slice(2);
if (!ffmpeg) throw new Error("Usage: node scripts/build-hls-preview-ladder.mjs <ffmpeg> [inputRoot] [outputRoot]");
const files = (await readdir(inputRoot)).filter(file => file.endsWith("-preview.mp4")).sort();
const concurrency = Math.max(1, Number(process.env.HLS_CONCURRENCY || 4));
let next = 0, complete = 0;
const manifest = [];

async function encode(file) {
  const id = basename(file, "-preview.mp4"), root = join(outputRoot, id), master = join(root, "master.m3u8");
  try { await stat(master); } catch {
    await mkdir(join(root, "v0"), { recursive: true });
    await mkdir(join(root, "v1"), { recursive: true });
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-i", join(inputRoot, file),
      "-filter_complex", "[0:v]split=2[lo][hi];[lo]scale=180:102,fps=15[loout];[hi]scale=360:202,fps=15[hiout]",
      "-map", "[loout]", "-c:v:0", "libx264", "-preset", "veryfast", "-crf:v:0", "34", "-maxrate:v:0", "250k", "-bufsize:v:0", "500k", "-g:v:0", "30", "-keyint_min:v:0", "30", "-sc_threshold:v:0", "0",
      "-map", "[hiout]", "-c:v:1", "libx264", "-preset", "veryfast", "-crf:v:1", "30", "-maxrate:v:1", "500k", "-bufsize:v:1", "1000k", "-g:v:1", "30", "-keyint_min:v:1", "30", "-sc_threshold:v:1", "0",
      "-an", "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
      "-master_pl_name", "master.m3u8", "-var_stream_map", "v:0,name:low v:1,name:high",
      "-hls_segment_filename", join(root, "v%v", "seg_%03d.ts"), join(root, "v%v", "index.m3u8"),
    ], { maxBuffer: 8 * 1024 * 1024 });
  }
  manifest.push({ id, master: `hls/${id}/master.m3u8` });
}
async function worker() {
  while (next < files.length) {
    const file = files[next++]; await encode(file); complete += 1;
    if (complete % 25 === 0 || complete === files.length) console.log(`encoded ${complete}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
await writeFile(join(outputRoot, "hls-preview-manifest.json"), JSON.stringify(manifest.sort((a,b)=>a.id.localeCompare(b.id)), null, 2) + "\n");
console.log(JSON.stringify({ files: files.length, outputRoot }));
