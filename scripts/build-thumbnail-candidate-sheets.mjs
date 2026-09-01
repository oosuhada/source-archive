import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const outputRoot = process.argv[2] || '/tmp/source-archive-thumbnail-candidates';
const ids = new Set((process.argv[3] || '41,138,141,430,454,463,471,472,491,495,507,537,628,644').split(','));
const roots = { r2: 'https://source-media.oosu.dev/media/', b2: 'https://source-media-b2.oosu.dev/media/' };
const context = { window: {} };
vm.createContext(context);
for (const file of ['data/source-library-data.js', 'data/source-library-youtube-data.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const items = context.window.SOURCE_LIBRARY.filter(item => ids.has(String(Number(item.id))));

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

for (const item of items) {
  const duration = Number(item.ranges?.at(-1)?.[1] || 1);
  const times = [0.15, 0.3, 0.5, 0.7, 0.85].map(ratio => Math.max(0, duration * ratio));
  const itemDir = path.join(outputRoot, String(item.id));
  fs.mkdirSync(itemDir);
  const url = `${roots[item.media || 'r2']}${item.clip}`;
  times.forEach((time, index) => {
    const label = `${item.id} ${item.title} ${time.toFixed(2)}s`.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const filter = `scale=320:180:force_original_aspect_ratio=decrease,pad=320:200:(ow-iw)/2:0:black,drawbox=x=0:y=180:w=320:h=20:color=black:t=fill,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${label}':fontcolor=white:fontsize=13:x=6:y=183`;
    run(['-loglevel', 'error', '-ss', time.toFixed(3), '-i', url, '-vf', filter, '-q:v', '2', '-frames:v', '1', path.join(itemDir, `${index}.jpg`)]);
  });
  run(['-loglevel', 'error', '-pattern_type', 'glob', '-i', `${itemDir}/*.jpg`, '-vf', 'tile=5x1:padding=4:margin=4:color=#222222', '-q:v', '2', '-frames:v', '1', path.join(outputRoot, `${item.id}.jpg`)]);
  console.log(`${item.id} ${item.title}`);
}
