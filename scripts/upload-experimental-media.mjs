import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const [manifestPath, buildRoot, wrangler] = process.argv.slice(2);
if (!manifestPath || !buildRoot || !wrangler) throw new Error("Usage: node scripts/upload-experimental-media.mjs <manifest> <build-root> <wrangler>");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.length !== 200) throw new Error(`Expected 200 entries, found ${manifest.length}`);
const bucket = "source-archive-media";
const cdnRoot = "https://source-media.oosu.dev/media/";

async function head(url, range = false) {
  return fetch(url, { method: "HEAD", headers: range ? { Range: "bytes=0-1023" } : {} });
}

for (const entry of manifest) {
  if (!entry.fastStart || entry.outputAudioStreams !== 0) throw new Error(`${entry.id}: output is not validated`);
  const filePath = path.join(buildRoot, "media", entry.outputFile);
  await stat(filePath);
  const url = `${cdnRoot}${entry.outputFile}`;

  if (!entry.uploaded) {
    // Use a unique query for the absence check so a CDN-cached 404 cannot hide
    // the object immediately after R2 upload or poison the production URL.
    const existing = await head(`${url}?preflight=${entry.id}-${Date.now()}`);
    if (existing.status !== 404) throw new Error(`${entry.outputFile}: refusing overwrite, CDN status ${existing.status}`);
    await execFileAsync(wrangler, [
      "r2", "object", "put", `${bucket}/media/${entry.outputFile}`, "--remote", "--file", filePath,
      "--content-type", "video/mp4", "--cache-control", "public, max-age=31536000, immutable",
    ], { maxBuffer: 8 * 1024 * 1024 });
  }

  const verifyUrl = `${url}?verify=${Date.now()}`;
  let normal;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    normal = await head(verifyUrl);
    if (normal.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (normal?.status !== 200) throw new Error(`${entry.outputFile}: CDN status ${normal?.status}`);
  let ranged;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    ranged = await head(verifyUrl, true);
    if (ranged.status === 206) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (ranged.status !== 206) throw new Error(`${entry.outputFile}: range status ${ranged.status}`);
  if (!String(normal.headers.get("content-type")).startsWith("video/mp4")) throw new Error(`${entry.outputFile}: wrong content type`);
  if (!String(normal.headers.get("cache-control")).includes("immutable")) throw new Error(`${entry.outputFile}: wrong cache control`);
  if (!ranged.headers.get("content-range")) throw new Error(`${entry.outputFile}: missing content range`);

  entry.uploaded = true;
  entry.cdnUrl = url;
  entry.cdnHttpStatus = normal.status;
  entry.rangeHttpStatus = ranged.status;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(`${entry.id} ${entry.outputFile} uploaded\n`);
}
