#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import vm from "node:vm";

const execute = process.argv.includes("--execute");
const wrangler = process.env.WRANGLER;
const bucket = process.env.R2_BUCKET || "source-archive-media";
const expectedCount = Number(process.env.EXPECTED_COUNT || 0);
const concurrency = Number(process.env.DELETE_CONCURRENCY || 4);

if (execute && !wrangler) throw new Error("WRANGLER is required with --execute");

const context = { window: {} };
vm.createContext(context);
for (const file of ["data/source-library-data.js", "data/source-library-youtube-data.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

const items = (context.window.SOURCE_LIBRARY || []).filter((item) => item.media === "b2");
const clips = [...new Set(items.map((item) => item.clip))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (clips.length !== items.length) throw new Error("Duplicate B2 clip names in metadata");
if (expectedCount && clips.length !== expectedCount) {
  throw new Error(`Expected ${expectedCount} clips, found ${clips.length}`);
}

let checked = 0;
let verifyIndex = 0;
const unavailable = [];
async function verifyWorker() {
  while (verifyIndex < clips.length) {
    const index = verifyIndex++;
    const clip = clips[index];
    const response = await fetch(`https://source-media-b2.oosu.dev/media/${encodeURIComponent(clip)}`, { method: "HEAD" });
    if (response.status !== 200) unavailable.push({ clip, status: response.status });
    checked += 1;
  }
}
await Promise.all(Array.from({ length: Math.min(8, clips.length) }, verifyWorker));
if (unavailable.length) throw new Error(`B2 verification failed: ${JSON.stringify(unavailable)}`);

if (!execute) {
  console.log(JSON.stringify({ mode: "dry-run", bucket, clips: clips.length, b2Verified: checked }));
  process.exit(0);
}

let nextIndex = 0;
let completed = 0;
const failures = [];

function remove(clip) {
  return new Promise((resolve) => {
    const child = spawn(wrangler, ["r2", "object", "delete", `${bucket}/media/${clip}`, "--remote"], {
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      completed += 1;
      if (code !== 0) failures.push({ clip, code, error: stderr.trim().slice(-800) });
      if (completed % 10 === 0 || completed === clips.length) {
        console.log(`deleted ${completed}/${clips.length}; failures ${failures.length}`);
      }
      resolve();
    });
  });
}

async function deleteWorker() {
  while (nextIndex < clips.length) {
    const index = nextIndex++;
    await remove(clips[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, clips.length) }, deleteWorker));
if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ deleted: clips.length, bucket }));
