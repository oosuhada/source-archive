import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const outputRoot = process.argv[2] || '/tmp/source-archive-thumbnail-audit';
const context = { window: {} };
vm.createContext(context);
for (const file of ['data/source-library-data.js', 'data/source-library-youtube-data.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
const items = context.window.SOURCE_LIBRARY;
const pageSize = 25;

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function escapeDrawtext(value) {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%');
}

for (let start = 0; start < items.length; start += pageSize) {
  const page = Math.floor(start / pageSize) + 1;
  const pageDir = path.join(outputRoot, `page-${String(page).padStart(2, '0')}`);
  fs.mkdirSync(pageDir);
  for (let offset = 0; offset < pageSize; offset += 1) {
    const item = items[start + offset];
    const target = path.join(pageDir, `${String(offset).padStart(2, '0')}.jpg`);
    if (!item) {
      run(['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x200', '-frames:v', '1', target]);
      continue;
    }
    const source = path.resolve('assets/thumbs', item.thumb);
    const label = escapeDrawtext(`${item.id} · ${item.title}`);
    const filter = `scale=320:180:force_original_aspect_ratio=decrease,pad=320:200:(ow-iw)/2:0:black,drawbox=x=0:y=180:w=320:h=20:color=black:t=fill,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${label}':fontcolor=white:fontsize=13:x=6:y=183`;
    run(['-loglevel', 'error', '-i', source, '-vf', filter, '-q:v', '3', '-frames:v', '1', target]);
  }
  const sheet = path.join(outputRoot, `audit-${String(page).padStart(2, '0')}.jpg`);
  run(['-loglevel', 'error', '-pattern_type', 'glob', '-i', `${pageDir}/*.jpg`, '-vf', 'tile=5x5:padding=4:margin=4:color=#222222', '-q:v', '2', '-frames:v', '1', sheet]);
}

console.log(JSON.stringify({ items: items.length, sheets: Math.ceil(items.length / pageSize), outputRoot }));
