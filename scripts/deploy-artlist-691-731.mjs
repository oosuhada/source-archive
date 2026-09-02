import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const [ffmpeg, sourceDir, outputRoot] = process.argv.slice(2);
if (!ffmpeg || !sourceDir || !outputRoot) {
  throw new Error("Usage: node scripts/deploy-artlist-691-731.mjs <ffmpeg> <source-dir> <output-root>");
}

const categoryMap = {
  People: "People / Culture", Sport: "Sport / Physical", Travel: "Travel / City / Architecture",
  Nature: "Nature / Land", Water: "Water", Object: "Object", Abstract: "Abstract",
};
const slugs = {
  691:"drowning", 692:"warmup", 693:"gifts", 694:"port-sunrise", 695:"beetle", 696:"scuba-diving", 697:"lava-flow", 698:"festival-float", 699:"marine-fish", 700:"hot-spring", 701:"autumn-branch", 702:"cigarette", 703:"underwater-light", 704:"glacier", 705:"retro-sky", 706:"desert-suits", 707:"tunnel-rush", 708:"taxi-pov", 709:"wrestling", 710:"fashion-dummy", 711:"dance-blur", 712:"savanna", 713:"zipper", 714:"motorbike-chase", 715:"whales", 716:"nature", 717:"ocean-swell", 718:"alone", 719:"father-son", 720:"desert-fpv", 721:"water-bubbles", 722:"cold-plunge", 723:"chase", 724:"manhattan-rooftops", 725:"subway", 726:"car-crash", 727:"hollywood-drive", 728:"cartoon-backdrop", 729:"color-burst", 730:"fluid-distortion", 731:"ocean-pov",
};
const keywords = {
  drowning:["water","person","survival","ocean","floating","dramatic","blue"], warmup:["muscles","fitness","warmup","skin","athlete","sport","training"], gifts:["gift","wrapped","curtain","romance","present","fabric","object"], "port-sunrise":["port","sunrise","fpv","city","travel","harbor","aerial"], beetle:["beetle","forest","water","droplets","nature","branches","macro"], "scuba-diving":["scuba","diving","ocean","water","adventure","underwater","australia"], "lava-flow":["lava","volcano","drone","nature","fire","landscape","aerial"], "festival-float":["festival","float","usa","parade","object","celebration","color"], "marine-fish":["fish","marine","ocean","water","underwater","sea","nature"], "hot-spring":["hot","spring","forest","geology","nature","steam","landscape"], "autumn-branch":["autumn","branch","forest","leaves","nature","season","tree"], cigarette:["cigarette","smoking","roadtrip","women","object","travel","smoke"], "underwater-light":["underwater","light","bubbles","ocean","water","sea","blue"], glacier:["glacier","ice","frozen","wilderness","nature","landscape","cold"], "retro-sky":["retro","sky","sun","clouds","people","nostalgia","film"], "desert-suits":["desert","men","suits","hands","people","fashion","surreal"], "tunnel-rush":["tunnel","traffic","night","hyperlapse","travel","city","speed"], "taxi-pov":["taxi","pov","night","driving","travel","city","sign"], wrestling:["wrestling","sport","athletes","warm","dramatic","fight","people"], "fashion-dummy":["fashion","dummy","design","woman","object","studio","mannequin"], "dance-blur":["dance","blur","pov","motion","people","night","movement"], savanna:["savanna","animals","wildlife","nature","habitat","africa","cute"], zipper:["zipper","coat","fabric","clothing","object","texture","closeup"], "motorbike-chase":["motorbike","chase","city","street","travel","speed","pov"], whales:["whales","ocean","tonga","water","marine","sea","nature"], nature:["waterfall","mountains","nature","scenic","water","landscape","travel"], "ocean-swell":["ocean","waves","swell","water","sea","nature","surf"], alone:["alone","apartment","sad","people","solitude","interior","emotion"], "father-son":["father","son","hug","family","people","love","child"], "desert-fpv":["desert","fpv","drone","rocky","travel","aerial","landscape"], "water-bubbles":["water","bubbles","underwater","surface","blue","ocean","relaxing"], "cold-plunge":["cold","plunge","water","mountains","wetsuit","winter","nature"], chase:["chase","fear","escape","people","dramatic","night","motion"], "manhattan-rooftops":["manhattan","rooftops","skyscrapers","city","travel","newyork","urban"], subway:["subway","train","station","travel","city","waiting","urban"], "car-crash":["car","crash","accident","cinematic","people","crime","drama"], "hollywood-drive":["hollywood","car","driving","losangeles","travel","city","vintage"], "cartoon-backdrop":["cartoon","background","retro","abstract","2d","color","animation"], "color-burst":["color","burst","explosion","abstract","flow","vibrant","motion"], "fluid-distortion":["fluid","distortion","abstract","experimental","color","texture","motion"], "ocean-pov":["ocean","pov","water","gopro","extreme","sport","waves"],
};

const tsv = await readFile(path.join(sourceDir, "metadata.tsv"), "utf8");
const rows = tsv.trim().split(/\r?\n/).slice(1).map((line) => {
  const [number, clipId, title, category, filename] = line.split("\t");
  return { number: Number(number), clipId, title, category, filename };
});
// 726 and 727 were deliberately rendered into one file.  Keep a single card
// and compact only the following IDs so the archive remains sequential.
const selected = rows.filter((row) => row.number !== 727).map((row) => ({ ...row, id: row.number > 727 ? row.number - 1 : row.number }));
const mediaDir = path.join(outputRoot, "media");
const thumbsDir = path.join(outputRoot, "thumbs");
await mkdir(mediaDir, { recursive: true });
await mkdir(thumbsDir, { recursive: true });

function dimensions(width, height) {
  const scale = Math.min(1, 1920 / width, 1080 / height);
  return [Math.max(2, Math.floor(width * scale / 2) * 2), Math.max(2, Math.floor(height * scale / 2) * 2)];
}
async function mediaInfo(file) {
  const script = 'import Foundation; import AVFoundation; let a=AVURLAsset(url:URL(fileURLWithPath:CommandLine.arguments[1])); let t=a.tracks(withMediaType:.video).first!; print("\\(CMTimeGetSeconds(a.duration))|\\(Int(t.naturalSize.width))|\\(Int(t.naturalSize.height))")';
  const { stdout } = await exec("/usr/bin/swift", ["-e", script, file], { maxBuffer: 1024 * 1024 });
  const [duration, width, height] = stdout.trim().split("|").map(Number);
  if (!(duration > 0 && width > 0 && height > 0)) throw new Error(`Cannot inspect ${file}`);
  return { duration, width, height };
}

const entries = [];
for (const row of selected) {
  const slug = slugs[row.id];
  const inputName = row.number === 726 ? "726-727-car-crash-combined.mp4" : row.filename;
  const input = path.join(sourceDir, inputName);
  const info = await mediaInfo(input);
  const [width, height] = dimensions(info.width, info.height);
  const outputFile = `${row.id}_${slug}.mp4`;
  const thumb = `${row.id}_${slug}.jpg`;
  const output = path.join(mediaDir, outputFile);
  const thumbPath = path.join(thumbsDir, thumb);
  await exec(ffmpeg, ["-hide_banner", "-loglevel", "warning", "-y", "-fflags", "+genpts", "-i", input, "-map", "0:v:0", "-an", "-vf", `scale=${width}:${height}`, "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-force_key_frames", "expr:gte(t,n_forced*0.5)", "-movflags", "+faststart", "-map_metadata", "-1", "-avoid_negative_ts", "make_zero", output], { maxBuffer: 8 * 1024 * 1024 });
  const outInfo = await mediaInfo(output);
  await exec(ffmpeg, ["-hide_banner", "-loglevel", "warning", "-y", "-ss", String(Math.max(0.1, outInfo.duration * 0.3)), "-i", output, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "2", thumbPath], { maxBuffer: 4 * 1024 * 1024 });
  entries.push({ id: String(row.id), title: row.title, originalFile: inputName, originalPath: input, slug, outputFile, thumb, duration: Number(info.duration.toFixed(3)), width: info.width, height: info.height, category: categoryMap[row.category], theme: "06", keywords: keywords[slug], media: "b2", outputDuration: Number(outInfo.duration.toFixed(3)), outputWidth: width, outputHeight: height, outputFps: "25/1", outputVideoCodec: "h264", outputPixelFormat: "yuv420p", outputAudioStreams: 0, fastStart: true, keyframeMaxGap: 0.52, outputBytes: (await stat(output)).size });
  process.stdout.write(`${row.id} ${outputFile}\n`);
}
await writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(entries, null, 2) + "\n");
process.stdout.write(`Prepared ${entries.length} archive assets\n`);
