import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const [manifestPath, buildRoot, ffmpeg, ffprobe, limitRaw] = process.argv.slice(2);
if (!manifestPath || !buildRoot || !ffmpeg || !ffprobe) {
  throw new Error("Usage: node scripts/process-experimental-import.mjs <manifest> <build-root> <ffmpeg> <ffprobe> [limit]");
}

const limit = limitRaw ? Number(limitRaw) : Infinity;
const mediaDir = path.join(buildRoot, "media");
const thumbsDir = path.join(buildRoot, "thumbs");
await mkdir(mediaDir, { recursive: true });
await mkdir(thumbsDir, { recursive: true });

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const selected = manifest.slice(0, limit);

function outputDimensions(width, height) {
  const scale = Math.min(1, 1920 / width, 1080 / height);
  return {
    width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2),
  };
}

async function probe(filePath) {
  const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function fastStart(filePath) {
  const handle = await open(filePath, "r");
  try {
    const size = Math.min((await stat(filePath)).size, 2 * 1024 * 1024);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);
    const ftyp = buffer.indexOf("ftyp", 0, "ascii");
    const moov = buffer.indexOf("moov", 0, "ascii");
    const mdat = buffer.indexOf("mdat", 0, "ascii");
    return ftyp >= 0 && moov > ftyp && mdat > moov;
  } finally {
    await handle.close();
  }
}

async function keyframeMaxGap(filePath) {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", filePath,
  ], { maxBuffer: 16 * 1024 * 1024 });
  const times = stdout.split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+(?:\.\d+)?)/)?.[1])
    .filter(Boolean)
    .map(Number);
  let maxGap = 0;
  for (let index = 1; index < times.length; index += 1) maxGap = Math.max(maxGap, times[index] - times[index - 1]);
  return Number(maxGap.toFixed(3));
}

async function processEntry(entry) {
  const outputPath = path.join(mediaDir, entry.outputFile);
  const thumbPath = path.join(thumbsDir, entry.thumb);
  const crop = entry.cropApplied?.split(":").map(Number);
  const target = outputDimensions(crop?.[0] || entry.width, crop?.[1] || entry.height);
  const filters = [...(crop ? [`crop=${entry.cropApplied}`] : []), `scale=${target.width}:${target.height}`];
  try {
    await stat(outputPath);
  } catch {
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-loglevel", "warning", "-y", "-fflags", "+genpts", "-i", entry.originalPath,
      "-map", "0:v:0", "-an", "-vf", filters.join(","),
      "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-force_key_frames", "expr:gte(t,n_forced*0.5)", "-movflags", "+faststart",
      "-map_metadata", "-1", "-avoid_negative_ts", "make_zero", outputPath,
    ], { maxBuffer: 8 * 1024 * 1024 });
  }

  const parsed = await probe(outputPath);
  const videos = parsed.streams.filter((stream) => stream.codec_type === "video");
  const audios = parsed.streams.filter((stream) => stream.codec_type === "audio");
  if (!videos.length) throw new Error(`${entry.outputFile}: no video stream`);
  if (audios.length) throw new Error(`${entry.outputFile}: audio stream remains`);
  if (videos[0].codec_name !== "h264" || videos[0].pix_fmt !== "yuv420p") throw new Error(`${entry.outputFile}: incompatible video encoding`);
  const isFastStart = await fastStart(outputPath);
  if (!isFastStart) throw new Error(`${entry.outputFile}: moov is not before mdat`);

  try {
    await stat(thumbPath);
  } catch {
    const duration = Number(parsed.format.duration || entry.duration);
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-loglevel", "warning", "-y", "-ss", String(Math.max(0.1, duration * 0.3)), "-i", outputPath,
      "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "2", thumbPath,
    ], { maxBuffer: 4 * 1024 * 1024 });
  }

  entry.outputDuration = Number(Number(parsed.format.duration || 0).toFixed(3));
  entry.outputWidth = Number(videos[0].width);
  entry.outputHeight = Number(videos[0].height);
  entry.outputFps = videos[0].avg_frame_rate;
  entry.outputVideoCodec = videos[0].codec_name;
  entry.outputPixelFormat = videos[0].pix_fmt;
  entry.outputAudioStreams = audios.length;
  entry.fastStart = isFastStart;
  entry.keyframeMaxGap = await keyframeMaxGap(outputPath);
  entry.outputBytes = (await stat(outputPath)).size;
  process.stdout.write(`${entry.id} ${entry.outputFile} ${entry.outputWidth}x${entry.outputHeight} ${entry.outputBytes}\n`);
}

for (let offset = 0; offset < selected.length; offset += 2) {
  await Promise.all(selected.slice(offset, offset + 2).map(processEntry));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
