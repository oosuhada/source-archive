import { readFile, writeFile } from "node:fs/promises";

const [incomingPath] = process.argv.slice(2);
if (!incomingPath) throw new Error("Usage: node scripts/merge-preview-manifest.mjs <incoming-manifest>");
const current = JSON.parse(await readFile("data/preview-manifest.json", "utf8"));
const incoming = JSON.parse(await readFile(incomingPath, "utf8"));
const byId = new Map(current.map((entry) => [entry.id, entry]));
for (const entry of incoming) {
  if (byId.has(entry.id)) throw new Error(`Refusing to replace existing preview mapping: ${entry.id}`);
  byId.set(entry.id, entry);
}
const merged = [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
await writeFile("data/preview-manifest.json", JSON.stringify(merged, null, 2) + "\n");
console.log(JSON.stringify({ existing: current.length, added: incoming.length, total: merged.length }));
