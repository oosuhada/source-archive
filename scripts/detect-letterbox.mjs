#!/usr/bin/env node

import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const sourceDir = process.argv[2];
const outputPath = process.argv[3];
const ffmpeg = process.env.FFMPEG;
const ffprobe = process.env.FFPROBE;
const concurrency = Number(process.env.SCAN_CONCURRENCY || 4);

if (!sourceDir || !ffmpeg || !ffprobe) {
  throw new Error("Usage: FFMPEG=... FFPROBE=... node detect-letterbox.mjs <media-dir> [report.json]");
}

const files = (await readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith(".mp4"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.slice(-1200))));
  });
}

async function inspect(name) {
  const file = join(sourceDir, name);
  const probe = await run(ffprobe, [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "json", file,
  ]);
  const parsed = JSON.parse(probe.stdout);
  const width = parsed.streams[0].width;
  const height = parsed.streams[0].height;
  const duration = Number(parsed.format.duration);
  const start = Math.max(0, Math.min(duration * 0.2, 2));
  const sampleDuration = Math.max(0.5, Math.min(6, duration - start));
  const scan = await run(ffmpeg, [
    "-hide_banner", "-ss", String(start), "-i", file, "-t", String(sampleDuration),
    "-vf", "cropdetect=limit=18:round=2:reset=24", "-an", "-f", "null", "-",
  ]);
  const counts = new Map();
  for (const match of scan.stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)) {
    const crop = match.slice(1).map(Number).join(":");
    counts.set(crop, (counts.get(crop) || 0) + 1);
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [`${width}:${height}:0:0`, 0];
  const [cropWidth, cropHeight, x, y] = dominant[0].split(":").map(Number);
  const lossX = 1 - cropWidth / width;
  const lossY = 1 - cropHeight / height;
  return {
    id: name.match(/^\d+/)?.[0], name, width, height, duration,
    crop: dominant[0], observations: dominant[1], lossX, lossY,
    centered: Math.abs(x * 2 + cropWidth - width) <= 4 && Math.abs(y * 2 + cropHeight - height) <= 4,
    candidate: (lossX >= 0.04 || lossY >= 0.04) && dominant[1] >= 8,
  };
}

let index = 0;
let completed = 0;
const results = [];
const failures = [];
async function worker() {
  while (index < files.length) {
    const current = index++;
    try { results.push(await inspect(files[current])); }
    catch (error) { failures.push({ name: files[current], error: String(error) }); }
    completed += 1;
    if (completed % 25 === 0 || completed === files.length) console.log(`scanned ${completed}/${files.length}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
results.sort((a, b) => Number(a.id) - Number(b.id));
const report = { sourceDir, scanned: results.length, failures, candidates: results.filter((item) => item.candidate), results };
if (outputPath) await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ scanned: results.length, failures: failures.length, candidates: report.candidates.length, outputPath }));
