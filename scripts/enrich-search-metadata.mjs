import { readFile, writeFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

const dataPath = "data/source-library-youtube-data.js";
const manifestPaths = ["data/experimental-import-manifest.json", "data/experimental-import-manifest-2.json"];
const firstImportedId = 275;

const stopWords = new Set([
  "a", "an", "and", "at", "by", "for", "from", "his", "her", "in", "into", "near",
  "of", "on", "onto", "over", "past", "the", "their", "to", "together", "with",
]);
const weakWords = new Set([
  "camera", "closeup", "extended", "footage", "looking", "series", "shot", "standing", "video",
]);
const categoryTerms = {
  "Abstract": ["abstract", "texture", "material", "motion", "visual", "organic", "surface", "macro", "experimental", "art"],
  "Object": ["object", "product", "artifact", "detail", "still-life", "material", "design", "macro", "sculpture"],
  "Template": ["template", "motion-graphics", "typography", "titles", "design", "animation", "editing", "creative", "branding"],
  "Cosmos": ["cosmos", "space", "astronomy", "galaxy", "universe", "celestial", "stars", "science", "sci-fi"],
  "Nature / Land": ["nature", "landscape", "outdoors", "environment", "organic", "natural", "earth", "scenery"],
  "Food / Drink": ["food", "drink", "culinary", "cooking", "kitchen", "ingredient", "meal", "restaurant", "gastronomy"],
  "People / Culture": ["people", "human", "portrait", "lifestyle", "culture", "person", "emotion", "documentary"],
  "Travel / City / Architecture": ["travel", "city", "architecture", "destination", "place", "urban", "landmark", "heritage", "aerial"],
  "Sport / Physical": ["sport", "fitness", "physical", "training", "athlete", "exercise", "strength", "movement", "performance"],
};
const preferredTerms = {
  "Object": new Set("projector film hammer pipe statue pillar record screen glass camera product object sculpture monolith instrument".split(" ")),
  "Cosmos": new Set("astronomy astrophotography galaxy galaxies cosmos space celestial nebula stars star universe wormhole milky way".split(" ")),
  "Nature / Land": new Set("forest flowers flower blossom ocean sea sky trees garden landscape sunset sunlight waves wildlife jellyfish".split(" ")),
  "Food / Drink": new Set("bread tomato tomatoes cake dessert hamburger sushi tea coffee beer pasta honey olives potato potatoes kitchen chef food drink".split(" ")),
  "People / Culture": new Set("man woman women men child children friends couple portrait models mechanic drummer artist dancer family".split(" ")),
  "Travel / City / Architecture": new Set("rome roman greece athens malta giza egypt petra pompeii cyprus larnaca vietnam india ruins temple architecture city stonehenge pyramids".split(" ")),
  "Sport / Physical": new Set("sport fitness workout gym athlete exercise bodybuilder boxing tennis basketball diving lifting training dancer ballet fighter".split(" ")),
};
const conceptRules = [
  [/flower|blossom|bloom|petal|floral/i, ["flower", "flowers", "blossom", "bloom", "blooms", "floral", "petal", "petals", "botanical", "garden", "spring"]],
  [/liquid|fluid|ink|oil|paint|emulsion/i, ["liquid", "fluid", "ink", "oil", "paint", "flow", "swirl", "mixing", "viscous", "pigment", "macro", "texture"]],
  [/bubble|soap/i, ["bubble", "bubbles", "soap", "foam", "iridescent", "surface", "macro", "colorful"]],
  [/fire|burn|flame|firework/i, ["fire", "flame", "flames", "burning", "heat", "spark", "sparks", "glow", "fireworks", "pyrotechnics", "explosion", "night"]],
  [/film|8mm|vhs|analog|retro|nostalgia/i, ["film", "analog", "analogue", "8mm", "vhs", "retro", "vintage", "archive", "grain", "nostalgia", "cinematic"]],
  [/glitch|distort|broken screen|digital breach/i, ["glitch", "distortion", "digital", "screen", "signal", "noise", "error", "technology", "cyber"]],
  [/galaxy|space|astronomy|astral|cosmic|nebula|star|wormhole/i, ["space", "astronomy", "cosmos", "galaxy", "universe", "star", "stars", "celestial", "cosmic", "sci-fi", "deep-space"]],
  [/body|muscle|fitness|gym|workout|athlete|exercise|lifting|boxing|tennis/i, ["body", "human", "muscle", "fitness", "training", "exercise", "athlete", "strength", "movement", "sport", "physical"]],
  [/ruin|rome|roman|greece|athens|temple|pyramid|giza|petra|stonehenge|architecture/i, ["architecture", "ancient", "history", "heritage", "archaeology", "landmark", "travel", "monument", "historic"]],
  [/food|bread|cake|dessert|burger|pasta|kitchen|chef|restaurant|tomato|potato|honey|sushi/i, ["food", "culinary", "cooking", "kitchen", "ingredient", "meal", "dish", "restaurant", "recipe", "gastronomy"]],
  [/man|woman|people|person|friends|couple|portrait|children|models/i, ["people", "person", "human", "portrait", "lifestyle", "emotion", "culture", "documentary"]],
  [/typography|title|opener|slideshow|transition|branding|logo/i, ["template", "typography", "titles", "motion-graphics", "animation", "editing", "branding", "design", "creative"]],
];
const phraseTitles = [
  [/milky way/i, "Milky Way"],
  [/black hole/i, "Black Hole"],
  [/roman ruins/i, "Roman Ruins"],
  [/ancient ruins/i, "Ancient Ruins"],
  [/old film/i, "Old Film"],
  [/film titles/i, "Film Titles"],
  [/stonehenge/i, "Stonehenge"],
  [/super hot vhs/i, "Super Hot VHS"],
];
const manualTitles = new Map(Object.entries({
  403: "Blossom", 404: "Audio Particles", 405: "Paint Burst", 406: "Mirror Ride",
  407: "Ethereal Flower", 408: "Desert Mirage", 412: "Gilded Paint", 413: "Spring Blur",
  414: "Broken Signal", 415: "Light Lines", 416: "Film Streaks", 417: "Candy Paint",
  418: "Liquid Serenity", 419: "Desert Monolith", 421: "Ink Bloom", 422: "Purple Assembly",
  423: "Fluid Mystery", 424: "Audio Wave", 425: "Color Flow", 426: "Grain Highway",
  427: "Ink Mixture", 429: "Liquid Spark", 430: "Broken Images", 432: "Desert Frame",
  434: "Speed Tunnel", 435: "Fluid Form", 436: "Red Liquid", 438: "Pink Current",
  439: "Blood Record", 441: "Floral Bubbles", 442: "Broken Glitch", 443: "Mint Paint",
  444: "Human Hands", 445: "Red Bubbles", 446: "Point Cloud", 447: "Electric Orb",
  449: "Red Room", 450: "Blue Glitch", 451: "Smoke Riders", 453: "Street Dissolve",
  454: "Pink Splash", 455: "Broken Warning", 456: "Hand Signals", 458: "Danger Signal",
  459: "Underwater Figure", 460: "Play Signal", 461: "Storm Cloud", 464: "Studio Work",
  466: "Neon Liquid", 467: "Golden Patches", 469: "Cloud Warrior", 470: "Fortress",
  471: "Piano Reflection", 477: "Food Blogger", 480: "Fashion Portrait", 481: "Fertilization",
  482: "Alien Particles", 483: "Wildfire", 485: "Metal Fasteners", 486: "Painted Figure",
  488: "Color Emulsion", 490: "Microscopic Life", 493: "Fruit Drops", 494: "Blue Substance",
  496: "Dumbbells", 497: "Pull Ups", 500: "Liquid Motion", 501: "Eye Patch",
  502: "Metal Resonance", 504: "Weight Lifting", 505: "8mm Transition", 514: "Analog Frame",
  515: "Pyramid Meditation", 516: "Karosta Sea", 517: "Old Province", 518: "Stone Carving",
  519: "Dagestan", 522: "Balinese Statue", 524: "Archaeologist", 526: "Analog Athens",
  527: "Desert Walk", 529: "Temazcal", 530: "Analog Ruins", 532: "Romantic Couple",
  533: "Tradition", 534: "Airfield Portrait", 536: "Friends", 537: "Anger",
  538: "Joy", 539: "Outdoor Portrait", 540: "Kashmir Portrait", 541: "Vietnam Coast",
  542: "Underpass", 543: "Contemplation", 544: "Partners", 545: "Male Models",
  547: "Fishermen", 548: "Pizza Walk", 549: "City Portrait", 551: "Daydream",
  553: "Sunlit Hand", 554: "Candid Meal", 555: "Hot Drink", 556: "Quiet Drink",
  558: "Beer Night", 559: "Field Portrait", 560: "Halloween", 562: "Warm Focus",
  566: "City Blur", 567: "VJ Pulse", 568: "Spiral VJ", 569: "Bubble River",
  570: "CGI Galaxy", 571: "Deep Space", 572: "Supernova", 573: "Supernova II",
  574: "Liquid Lens", 575: "Neon Loop", 576: "CGI Galaxy II", 577: "Purple Fluid",
  578: "Art Drop", 579: "Fire Loop", 580: "Glitter Flow", 582: "Cosmic Clouds",
  583: "Jellyfish", 584: "Light Beams", 586: "Liquid Glitter", 587: "Ink Fractal",
  589: "Dark Bubble", 590: "Astral Dust", 591: "Liquid Glitter II", 592: "Aqua Texture",
  593: "Wormhole", 595: "Fluid Color", 596: "Spiral Galaxy", 597: "Fluid Light",
  598: "Dark Cosmos", 599: "Bread Making", 600: "Almond Dessert", 602: "Candle Dinner",
  603: "Hot Service", 604: "Stop Motion", 605: "Fig Market", 606: "Potato Pancakes",
  607: "Plated Meat", 608: "Olive Plate", 609: "Forest Table", 610: "Kitchen Prep",
  611: "Vanilla Crunch", 612: "Burger Assembly", 613: "Olive Cake", 614: "Fine Dining",
  615: "Dessert Finish", 616: "Boiling Water", 617: "Sweet Potatoes", 619: "Pie Serving",
  622: "Street Food", 626: "Burning Car", 634: "Running Legs", 635: "Training Partners",
  636: "Mud Figure", 637: "Giza", 639: "Analog Rome", 640: "Monochrome City",
  641: "Analog Memory", 642: "Ruins Memory", 643: "Industrial Sunset",
}).map(([id, title]) => [String(id), title]));

function tokens(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function displayWord(word) {
  const special = { ai: "AI", bpm: "BPM", cgi: "CGI", usa: "USA", vhs: "VHS", vj: "VJ" };
  if (special[word]) return special[word];
  if (/^\d+d$/.test(word)) return word.toUpperCase();
  if (/^\d+mm$/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function shortTitle(item) {
  if (manualTitles.has(item.id)) return manualTitles.get(item.id);
  for (const [rule, title] of phraseTitles) if (rule.test(item.title)) return title;
  const source = tokens(item.title).filter((word) => !stopWords.has(word) && !/^\d+$/.test(word));
  if (item.category === "Template") {
    const useful = source.filter((word) => !new Set(["pack", "collection", "scenes"]).has(word));
    return (useful.length ? useful : source).slice(0, 3).map(displayWord).join(" ");
  }
  const preferred = preferredTerms[item.category];
  const selected = preferred ? source.filter((word) => preferred.has(word)) : [];
  const useful = source.filter((word) => !weakWords.has(word));
  const chosen = (selected.length ? selected : useful.length ? useful : source).slice(0, 2);
  return chosen.map(displayWord).join(" ") || `Source ${item.id}`;
}

function enrichedKeywords(item, originalTitle) {
  const words = new Set([
    ...tokens(originalTitle),
    ...(item.keywords || []).flatMap(tokens),
    ...(categoryTerms[item.category] || []).flatMap(tokens),
  ]);
  const searchable = `${originalTitle} ${(item.keywords || []).join(" ")} ${item.category}`;
  for (const [rule, additions] of conceptRules) if (rule.test(searchable)) additions.flatMap(tokens).forEach((word) => words.add(word));
  return [...words].filter((word) => word && !stopWords.has(word)).slice(0, 64);
}

function objectBounds(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing marker: ${marker}`);
  const start = source.lastIndexOf("{", markerAt);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return { start, end: index + 1 };
  }
  throw new Error(`Unterminated object: ${marker}`);
}

const originalTitleById = new Map();
for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const entry of manifest) originalTitleById.set(entry.id, entry.originalTitle || entry.title);
}

let data = await readFile(dataPath, "utf8");
const context = { window: {} };
createContext(context);
runInContext(data, context);
const imported = context.window.SOURCE_LIBRARY.filter((item) => Number(item.id) >= firstImportedId);
const metadata = new Map();

for (const item of [...imported].sort((a, b) => Number(b.id) - Number(a.id))) {
  const originalTitle = originalTitleById.get(item.id) || item.title;
  const title = shortTitle(item);
  const keywords = enrichedKeywords(item, originalTitle);
  metadata.set(item.id, { title, originalTitle, keywords });
  const bounds = objectBounds(data, `"id": "${item.id}"`);
  const object = data.slice(bounds.start, bounds.end);
  let revised = object.replace(/"title": "(?:\\.|[^"])*"/, `"title": ${JSON.stringify(title)}`);
  revised = revised.replace(/"keywords": \[[\s\S]*?\]/, `"keywords": ${JSON.stringify(keywords, null, 6).replace(/^/gm, "    ").trimStart()}`);
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);
}
await writeFile(dataPath, data);

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const entry of manifest) {
    const revision = metadata.get(entry.id);
    if (!revision) continue;
    entry.title = revision.title;
    entry.originalTitle = revision.originalTitle;
    entry.keywords = revision.keywords;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

const report = [...metadata].map(([id, value]) => ({ id, ...value, words: value.title.split(/\s+/).length }));
await writeFile("data/search-metadata-audit.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ updated: report.length, overThreeWords: report.filter((item) => item.words > 3).length, averageKeywords: Number((report.reduce((sum, item) => sum + item.keywords.length, 0) / report.length).toFixed(1)) }) + "\n");
