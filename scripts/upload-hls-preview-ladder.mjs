import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const [root = "build/hls-preview-ladder", prefix = "hls"] = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !accountId) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
const bucket = process.env.R2_BUCKET || "source-archive-media";
const concurrency = Math.max(1, Number(process.env.HLS_UPLOAD_CONCURRENCY || 4));
const overwritePlaylists = process.env.HLS_OVERWRITE_PLAYLISTS === "1";
const contentType = file => file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".ts") ? "video/mp2t" : "video/mp4";
async function list(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? list(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`;
async function existingKeys() {
  const keys = new Set(); let cursor = "";
  do {
    const url = new URL(endpoint);url.searchParams.set("prefix", `${prefix}/`);url.searchParams.set("per_page", "1000");if(cursor)url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });if(!response.ok)throw new Error(`list existing: HTTP ${response.status}`);
    const payload = await response.json();payload.result.forEach(item => keys.add(item.key));cursor = payload.result_info?.is_truncated ? payload.result_info.cursor : "";
  } while (cursor);
  return keys;
}
const allFiles = (await list(root)).filter(file => !file.endsWith("hls-preview-manifest.json"));
const existing = await existingKeys();
const files = allFiles.filter(file => {
  const key = `${prefix}/${relative(root, file).replaceAll("\\", "/")}`;
  return !existing.has(key) || (overwritePlaylists && file.endsWith(".m3u8"));
});
let next = 0, done = 0, failures = [];
async function upload(file) {
  const key = `${prefix}/${relative(root, file).replaceAll("\\", "/")}`;
  const body = await readFile(file);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType(file), "Cache-Control": "public, max-age=31536000, immutable" }, body, signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return;
    if (response.status !== 429 && response.status < 500) throw new Error(`${key}: HTTP ${response.status}`);
    await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
  }
  throw new Error(`${key}: retry limit`);
}
async function worker() {
  while (next < files.length) {
    const file = files[next++];
    try { await upload(file); } catch (error) { failures.push(String(error.message || error)); }
    done += 1;if (done % 100 === 0 || done === files.length) console.log(`uploaded ${done}/${files.length}; failures ${failures.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
if (failures.length) throw new Error(JSON.stringify({ failures: failures.slice(0, 20), count: failures.length }));
console.log(JSON.stringify({ uploaded: files.length, skipped: allFiles.length - files.length, bucket, prefix }));
