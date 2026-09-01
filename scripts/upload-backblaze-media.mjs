#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

const sourceDir = process.argv[2];
const bucket = process.argv[3];
const b2Cli = process.env.B2_CLI;
const concurrency = Number(process.env.UPLOAD_CONCURRENCY || 4);
const includeIds = new Set((process.env.INCLUDE_IDS || "").split(",").filter(Boolean));

if (!sourceDir || !bucket || !b2Cli) {
  console.error("Usage: B2_CLI=/path/to/b2 node upload-backblaze-media.mjs <media-dir> <bucket>");
  process.exit(2);
}

const files = (await readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith(".mp4"))
  .filter((name) => !includeIds.size || includeIds.has(name.match(/^\d+/)?.[0]))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

let nextIndex = 0;
let completed = 0;
const failures = [];

function upload(name) {
  const localPath = join(sourceDir, name);
  const remotePath = `media/${basename(name)}`;
  const args = [
    "file",
    "upload",
    "--no-progress",
    "--content-type",
    "video/mp4",
    "--cache-control",
    "public, max-age=31536000, immutable",
    "--destination-server-side-encryption",
    "SSE-B2",
    bucket,
    localPath,
    remotePath,
  ];

  return new Promise((resolve) => {
    const child = spawn(b2Cli, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      completed += 1;
      if (code !== 0) failures.push({ name, code, error: stderr.trim().slice(-1000) });
      if (completed % 10 === 0 || completed === files.length) {
        console.log(`uploaded ${completed}/${files.length}; failures ${failures.length}`);
      }
      resolve();
    });
  });
}

async function worker() {
  while (nextIndex < files.length) {
    const index = nextIndex++;
    await upload(files[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));

if (failures.length) {
  console.error(JSON.stringify({ uploaded: files.length - failures.length, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ uploaded: files.length, bucket, prefix: "media/" }));
