import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const source = process.argv[2] || 'build/hls-preview-ladder-ts';
const output = process.argv[3] || 'assets/hls-boot-packs';
const manifest = process.argv[4] || 'data/hls-boot-pack-manifest.js';
const packSize = 50;

const clips = (await readdir(source, { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const map = {};
for (let start = 0, number = 1; start < clips.length; start += packSize, number += 1) {
  const group = clips.slice(start, start + packSize);
  const entries = await Promise.all(group.map(async clip => ({ name: `${clip}.ts`, data: await readFile(join(source, clip, 'vlow', 'seg_000.ts')) })));
  const header = Buffer.alloc(12);header.write('SAHLSB01', 0, 'ascii');header.writeUInt32LE(entries.length, 8);
  const tableSize = entries.reduce((size, entry) => size + 2 + Buffer.byteLength(entry.name) + 8, 0);
  let offset = 12 + tableSize;
  const table = [], payload = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name), row = Buffer.alloc(2 + name.length + 8);
    row.writeUInt16LE(name.length, 0);name.copy(row, 2);row.writeUInt32LE(offset, 2 + name.length);row.writeUInt32LE(entry.data.length, 6 + name.length);
    table.push(row);payload.push(entry.data);map[entry.name.slice(0, -3)] = `boot-${String(number).padStart(2, '0')}.bin`;offset += entry.data.length;
  }
  await writeFile(join(output, `boot-${String(number).padStart(2, '0')}.bin`), Buffer.concat([header, ...table, ...payload]));
}
await writeFile(manifest, `window.SOURCE_ARCHIVE_HLS_BOOT_PACKS=${JSON.stringify(map)};\n`);
console.log(JSON.stringify({ clips: clips.length, packs: new Set(Object.values(map)).size, output }));
