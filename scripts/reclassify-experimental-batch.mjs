import { readFile, writeFile } from "node:fs/promises";

const categoryIds = new Map([
  ["Abstract", [
    113, 159, 231, 260, 261, 262, 404, 405, 406, 410, 412, 417, 418, 420, 421,
    423, 424, 425, 426, 427, 428, 429, 434, 438, 440, 443, 447, 449, 451, 459,
    466, 472, 473, 474, 488, 489, 490, 495, 497, 500, 501,
    507, 512, 574, 575, 576, 581, 582, 584, 585, 586, 587, 590, 591, 592, 593,
    594, 596, 598, 599, 601, 602, 604,
  ]],
  ["Object", [
    170, 230, 248, 271, 274, 442, 462, 476, 492,
    506, 509, 525, 529, 633,
  ]],
  ["Nature / Land", [
    233, 403, 407, 413, 432, 444, 464,
    523, 524, 548, 640, 650,
  ]],
  ["Food / Drink", [
    263, 439, 483, 484, 485, 486, 498,
    561, 562, 563, 565, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615,
    616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629,
  ]],
  ["People / Culture", [
    453, 471, 479, 487,
    508, 539, 540, 541, 542, 543, 544, 545, 546, 547, 549, 550, 551, 552,
    553, 554, 555, 556, 558, 560, 564, 566, 567, 569, 570, 573, 635, 643,
  ]],
  ["Travel / City / Architecture", [
    477,
    516, 517, 518, 519, 520, 521, 522, 526, 527, 528, 530, 531, 532, 533,
    534, 535, 536, 537, 538, 571, 639, 644, 645, 646, 647, 648, 649,
  ]],
  ["Sport / Physical", [
    448, 461, 475, 491, 493, 494, 496, 499, 502, 503, 504, 505,
    510, 511, 513, 514, 515, 557, 559, 568, 572, 630, 631, 632, 634, 636,
    637, 638, 641, 642, 651,
  ]],
  ["Cosmos", [577, 578, 579, 580, 583, 588, 589, 595, 597, 600, 603, 605]],
]);

const categoryById = new Map();
for (const [category, ids] of categoryIds) {
  for (const numericId of ids) {
    const id = String(numericId);
    if (categoryById.has(id)) throw new Error(`Duplicate mapping for ID ${id}`);
    categoryById.set(id, category);
  }
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

const dataPath = "data/source-library-youtube-data.js";
let data = await readFile(dataPath, "utf8");
for (const [id, category] of categoryById) {
  const bounds = objectBounds(data, `"id": "${id}"`);
  const object = data.slice(bounds.start, bounds.end);
  const revised = object.replace(/"category": "[^"]+"/, `"category": "${category}"`);
  if (object === revised && !object.includes(`"category": "${category}"`)) {
    throw new Error(`${id}: category was not updated`);
  }
  data = data.slice(0, bounds.start) + revised + data.slice(bounds.end);
}
await writeFile(dataPath, data);

for (const manifestPath of ["data/experimental-import-manifest.json", "data/experimental-import-manifest-2.json"]) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const entry of manifest) {
    const category = categoryById.get(entry.id);
    if (category) entry.category = category;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

const counts = Object.fromEntries([...categoryIds].map(([category, ids]) => [category, ids.length]));
process.stdout.write(JSON.stringify({ updated: categoryById.size, counts }) + "\n");
