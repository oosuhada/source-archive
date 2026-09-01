import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const [sourceDir, outputPath, ffprobe] = process.argv.slice(2);
if (!sourceDir || !outputPath || !ffprobe) throw new Error("Usage: node scripts/build-footage-import-4.mjs <source-dir> <manifest> <ffprobe>");

const definitions = [
  [265, "Greek Faces", "Object", ["greek", "faces", "classical", "sculpture", "statue", "marble", "profile", "portrait", "art", "museum", "ancient", "object"]],
  [266, "Photo Collage", "Abstract", ["photo", "collage", "portrait", "photography", "paper", "composition", "creative", "editorial", "faces", "cutout", "design", "abstract"]],
  [267, "Gymnast Rings", "Sport / Physical", ["gymnast", "rings", "gymnastics", "athlete", "acrobatics", "strength", "training", "arena", "competition", "sport", "fitness", "motion"]],
  [268, "Pommel Horse", "Sport / Physical", ["gymnast", "pommel", "horse", "gymnastics", "athlete", "acrobatics", "strength", "arena", "competition", "sport", "fitness", "motion"]],
  [269, "Swimmers", "Sport / Physical", ["swimmers", "swimming", "underwater", "pool", "athlete", "aquatic", "training", "competition", "sport", "fitness", "water", "motion"]],
  [270, "Church Interior", "Travel / City / Architecture", ["church", "interior", "architecture", "altar", "cathedral", "religion", "historic", "sacred", "aisle", "travel", "building", "heritage"]],
  [271, "Figure Skating", "Sport / Physical", ["figure", "skating", "ice", "skater", "athlete", "rink", "performance", "winter", "competition", "sport", "grace", "motion"]],
  [272, "Fine Dining 2", "Food / Drink", ["fine", "dining", "restaurant", "table", "cutlery", "plate", "hospitality", "luxury", "meal", "food", "service", "interior"]],
  [273, "Ice Hockey", "Sport / Physical", ["ice", "hockey", "players", "puck", "rink", "team", "athlete", "winter", "competition", "sport", "game", "action"]],
  [274, "Forest Foraging", "Nature / Land", ["forest", "foraging", "mushroom", "hands", "wild", "woodland", "harvest", "organic", "nature", "outdoors", "ecology", "food"]],
  [275, "Jazz Ensemble", "People / Culture", ["jazz", "ensemble", "musicians", "music", "instrument", "performance", "band", "concert", "culture", "people", "stage", "rhythm"]],
  [276, "Fencing", "Sport / Physical", ["fencing", "fencer", "sword", "athlete", "duel", "combat", "training", "competition", "sport", "uniform", "mask", "motion"]],
  [277, "Backyard Film", "Nature / Land", ["backyard", "yard", "garden", "home", "vintage", "8mm", "film", "nostalgia", "grass", "outdoors", "family", "nature"]],
  [278, "Retro Cycling", "Sport / Physical", ["retro", "cycling", "bicycle", "child", "vintage", "8mm", "film", "nostalgia", "outdoors", "sport", "bike", "motion"]],
  [279, "Christmas Film", "People / Culture", ["christmas", "holiday", "vintage", "1950s", "8mm", "film", "tree", "family", "nostalgia", "celebration", "winter", "culture"]],
  [280, "Glass Sculpture", "Object", ["glass", "sculpture", "molten", "furnace", "craft", "artisan", "material", "heat", "making", "art", "object", "workshop"]],
  [281, "Whiskey Pour", "Food / Drink", ["whiskey", "pour", "glass", "drink", "alcohol", "spirits", "bar", "amber", "beverage", "ice", "closeup", "food"]],
  [282, "Rolling Dice", "Object", ["dice", "rolling", "game", "chance", "luck", "table", "object", "casino", "random", "play", "motion", "closeup"]],
  [283, "Light Bulbs", "Object", ["light", "bulbs", "filament", "electricity", "illumination", "glow", "lamp", "technology", "object", "design", "warm", "energy"]],
  [284, "Calligraphy", "People / Culture", ["japanese", "calligraphy", "writing", "ink", "brush", "paper", "artist", "tradition", "culture", "craft", "handwriting", "studio"]],
  [285, "Bank Robbery", "Business", ["bank", "robbery", "security", "cctv", "crime", "camera", "surveillance", "money", "finance", "heist", "interior", "business"]],
  [286, "Christmas Home", "People / Culture", ["christmas", "home", "tree", "holiday", "ornament", "lights", "family", "celebration", "winter", "cozy", "interior", "culture"]],
  [287, "Pencil Drawing", "Object", ["pencil", "drawing", "graphite", "paper", "sketch", "line", "artist", "illustration", "creative", "closeup", "craft", "object"]],
  [288, "Oil Painting", "People / Culture", ["oil", "painting", "paint", "tubes", "artist", "canvas", "palette", "color", "studio", "creative", "craft", "culture"]],
  [289, "Plastic Dance", "Abstract", ["plastic", "dance", "performer", "silhouette", "fabric", "installation", "movement", "experimental", "abstract", "art", "texture", "body"]],
  [290, "Kettlebell", "Sport / Physical", ["kettlebell", "workout", "strength", "fitness", "athlete", "training", "gym", "exercise", "muscle", "sport", "weight", "motion"]],
  [291, "Rope Climb", "Sport / Physical", ["rope", "climb", "workout", "strength", "fitness", "athlete", "training", "gym", "exercise", "muscle", "sport", "pull"]],
  [292, "Money Count", "Business", ["money", "counting", "cash", "currency", "banknotes", "finance", "business", "wealth", "payment", "economy", "dollar", "closeup"]],
  [293, "Beer Pour", "Food / Drink", ["beer", "pour", "glass", "drink", "alcohol", "brewery", "foam", "bar", "beverage", "golden", "closeup", "food"]],
  [294, "Charcoal Drawing", "Object", ["charcoal", "drawing", "paper", "sketch", "black", "artist", "illustration", "creative", "closeup", "craft", "texture", "object"]],
  [295, "Wind Turbines", "Nature / Land", ["wind", "turbines", "renewable", "energy", "electricity", "sustainability", "landscape", "environment", "technology", "nature", "clean", "power"]],
  [296, "Sunset Horizon", "Nature / Land", ["sunset", "horizon", "sun", "sky", "silhouette", "evening", "dusk", "landscape", "nature", "orange", "calm", "scenery"]],
];

const names = await readdir(sourceDir);
const entries = [];
for (let index = 0; index < definitions.length; index += 1) {
  const [sourceId, title, category, keywords] = definitions[index];
  const originalFile = names.find((name) => name.startsWith(`${sourceId}-`) && name.endsWith(".mp4"));
  if (!originalFile) throw new Error(`Missing source ${sourceId}`);
  const slug = originalFile.replace(/^\d+-/, "").replace(/\.mp4$/i, "");
  const id = String(659 + index);
  const originalPath = path.resolve(sourceDir, originalFile);
  const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", originalPath]);
  const probe = JSON.parse(stdout);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const fpsParts = String(video.avg_frame_rate || "0/1").split("/").map(Number);
  entries.push({
    id, title, originalFile, originalPath, slug,
    outputFile: `${id}_${slug}.mp4`, thumb: `${id}_${slug}.jpg`,
    duration: Number(probe.format.duration), width: video.width, height: video.height,
    fps: fpsParts[1] ? fpsParts[0] / fpsParts[1] : 0, videoCodec: video.codec_name,
    audioStreamsOriginal: probe.streams.filter((stream) => stream.codec_type === "audio").length,
    category, theme: "06", keywords,
    ...(sourceId === 278 ? { cropApplied: "1512:1080:204:0" } : {}),
    ...(sourceId === 283 ? { cropApplied: "1920:1016:0:32" } : {}),
    media: "b2",
  });
}
await writeFile(outputPath, JSON.stringify(entries, null, 2) + "\n");
console.log(`Created ${entries.length} entries (${entries[0].id}-${entries.at(-1).id})`);
