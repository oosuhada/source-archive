import { copyFile, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const [buildRoot, mode = "prepare"] = process.argv.slice(2);
if (!buildRoot || !["prepare", "finalize"].includes(mode)) {
  throw new Error("Usage: node scripts/revise-letterboxed-footage-2.mjs <build-root> <prepare|finalize>");
}

const revisions = new Map([
  ["478", { outputFile: "478_reflection-from-a-piano-cropped.mp4", crop: "1920:816:0:132" }],
  ["509", { outputFile: "509_wooden-hammer-hitting-metal-pipe-cropped.mp4", crop: "1920:816:0:132" }],
  ["576", { outputFile: "576_abstract-river-of-blue-surrounded-by-multi-colored-bubbles-cropped.mp4", crop: "1920:900:0:90" }],
]);

const manifestPath = "data/experimental-import-manifest-2.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

for (const entry of manifest) {
  const revision = revisions.get(entry.id);
  if (!revision) continue;

  if (mode === "prepare") {
    if (!entry.supersedesOutputFile) entry.supersedesOutputFile = entry.outputFile;
    entry.originalPath = path.resolve(buildRoot, "media", entry.supersedesOutputFile);
    entry.outputFile = revision.outputFile;
    entry.cropApplied = revision.crop;
    for (const key of [
      "outputDuration", "outputWidth", "outputHeight", "outputFps", "outputVideoCodec",
      "outputPixelFormat", "outputAudioStreams", "fastStart", "keyframeMaxGap", "outputBytes",
      "uploaded", "cdnUrl", "cdnHttpStatus", "rangeHttpStatus",
    ]) delete entry[key];
    await unlink(path.join(buildRoot, "thumbs", entry.thumb)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    continue;
  }

  entry.media = "b2";
  delete entry.originalPath;
  entry.uploaded = true;
  entry.cdnUrl = `https://source-media-b2.oosu.dev/media/${entry.outputFile}`;
  entry.cdnHttpStatus = 200;
  entry.rangeHttpStatus = 206;
  entry.outputBytes = (await stat(path.join(buildRoot, "media", entry.outputFile))).size;
  await copyFile(path.join(buildRoot, "thumbs", entry.thumb), path.join("assets/thumbs", entry.thumb));
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

if (mode === "finalize") {
  const dataPath = "data/source-library-youtube-data.js";
  let data = await readFile(dataPath, "utf8");
  for (const [id, revision] of revisions) {
    const marker = `"id": "${id}"`;
    const markerAt = data.indexOf(marker);
    if (markerAt < 0) throw new Error(`Missing metadata ID ${id}`);
    const start = data.lastIndexOf("{", markerAt);
    const end = data.indexOf("\n  },", markerAt) + 4;
    const object = data.slice(start, end);
    const revised = object.replace(/"clip": "[^"]+"/, `"clip": "${revision.outputFile}"`);
    if (object === revised) throw new Error(`${id}: clip was not updated`);
    data = data.slice(0, start) + revised + data.slice(end);
  }
  await writeFile(dataPath, data);
}

process.stdout.write(`${mode}: revised ${revisions.size} letterboxed items\n`);
