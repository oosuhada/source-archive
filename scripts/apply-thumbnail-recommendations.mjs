import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const roots = { r2: 'https://source-media.oosu.dev/media/', b2: 'https://source-media-b2.oosu.dev/media/' };
const timestamps = new Map(Object.entries({
  '41': 4.45,
  '138': 10.95,
  '141': 7.50,
  '243': 7.00,
  '244': 9.90,
  '430': 5.07,
  '454': 24.28,
  '463': 1.04,
  '472': 6.18,
  '491': 12.56,
  '495': 3.56,
  '502': 2.15,
  '507': 25.67,
  '537': 5.42,
  '542': 8.78,
  '546': 2.15,
  '628': 21.53,
  '644': 18.78,
}));

const context = { window: {} };
vm.createContext(context);
for (const file of ['data/source-library-data.js', 'data/source-library-youtube-data.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
}

for (const item of context.window.SOURCE_LIBRARY) {
  const id = String(Number(item.id));
  if (!timestamps.has(id)) continue;
  const target = path.resolve('assets/thumbs', item.thumb);
  const temporary = `${target}.new.jpg`;
  const url = `${roots[item.media || 'r2']}${item.clip}`;
  const result = spawnSync(ffmpeg, [
    '-loglevel', 'error',
    '-ss', String(timestamps.get(id)),
    '-i', url,
    '-vf', 'scale=960:-2',
    '-frames:v', '1',
    '-q:v', '2',
    '-y', temporary,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${id} ${item.clip}: ${result.stderr}`);
  fs.renameSync(temporary, target);
  console.log(`${id} ${item.title} ${timestamps.get(id).toFixed(2)}s -> ${item.thumb}`);
}
