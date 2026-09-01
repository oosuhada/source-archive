import { readFile, writeFile } from "node:fs/promises";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node scripts/verify-backblaze-import.mjs <manifest>");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function request(url, options) {
  let response;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (response && ![429, 500, 502, 503, 504].includes(response.status)) return response;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return response;
}

for (const entry of manifest) {
  if (entry.uploaded && entry.cdnHttpStatus === 200 && entry.rangeHttpStatus === 206) continue;
  const url = `https://source-media-b2.oosu.dev/media/${entry.outputFile}`;
  const cacheBust = `${url}?verify=${Date.now()}-${entry.id}`;
  const normal = await request(cacheBust, { method: "HEAD" });
  const ranged = await request(cacheBust, { headers: { Range: "bytes=0-1023" } });
  if (normal?.status !== 200) throw new Error(`${entry.id}: HTTP ${normal?.status}`);
  if (ranged?.status !== 206 || !ranged.headers.get("content-range")) throw new Error(`${entry.id}: Range ${ranged?.status}`);
  if (!String(normal.headers.get("content-type")).startsWith("video/mp4")) throw new Error(`${entry.id}: ${normal.headers.get("content-type")}`);
  if (!String(normal.headers.get("cache-control")).includes("immutable")) throw new Error(`${entry.id}: ${normal.headers.get("cache-control")}`);
  entry.uploaded = true;
  entry.cdnUrl = url;
  entry.cdnHttpStatus = 200;
  entry.rangeHttpStatus = 206;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${entry.id} verified`);
}
