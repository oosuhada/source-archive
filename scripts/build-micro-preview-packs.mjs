import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = "build/two-tier-previews-loop-180/micro";
const output = "assets/micro-packs";
const perPack = 50;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
const crc32 = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
const u16 = value => { const out = Buffer.alloc(2); out.writeUInt16LE(value); return out; };
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32LE(value >>> 0); return out; };

async function zipStored(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const fileName = Buffer.from(name), size = bytes.length, crc = crc32(bytes);
    const local = Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(fileName.length),u16(0),fileName,bytes]);
    parts.push(local);
    central.push(Buffer.concat([Buffer.from([0x50,0x4b,0x01,0x02]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(fileName.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),fileName]));
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  return Buffer.concat([...parts, directory, Buffer.from([0x50,0x4b,0x05,0x06]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(directory.length),u32(offset),u16(0)]);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = (await readdir(source)).filter(name => name.endsWith(".mp4")).sort();
const byFile = {};
for (let start = 0, number = 1; start < files.length; start += perPack, number += 1) {
  const names = files.slice(start, start + perPack);
  const pack = `micro-${String(number).padStart(2, "0")}.zip`;
  const entries = await Promise.all(names.map(async name => ({ name, bytes: await readFile(join(source, name)) })));
  await writeFile(join(output, pack), await zipStored(entries));
  names.forEach(name => { byFile[name] = pack; });
}
await writeFile("data/micro-pack-manifest.js", `window.SOURCE_ARCHIVE_MICRO_PACKS=${JSON.stringify(byFile)};\n`);
process.stdout.write(JSON.stringify({ files: files.length, packs: new Set(Object.values(byFile)).size }) + "\n");
