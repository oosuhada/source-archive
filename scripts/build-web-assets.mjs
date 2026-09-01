import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

const files = ["data/source-library-data.js", "data/source-library-youtube-data.js"];
const context = { window: {} };
createContext(context);
for (const file of files) runInContext(await readFile(file, "utf8"), context);

const aliases = {
  "Food / Drink": "Food", "Nature / Land": "Nature",
  "Experimental / Material / Object": "Experimental",
  "Sky / Space / Weather": "Nature", Water: "Water", "Work / Tech": "Business",
  "People / Culture": "People", "Travel / City / Architecture": "Travel",
  "Sport / Physical": "Sport",
};
const cosmosIds = new Set(["12", "13", "25", "111", "112", "138", "140"]);
const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const documents = context.window.SOURCE_LIBRARY.map((item) => {
  const category = cosmosIds.has(item.id) ? "Cosmos" : aliases[item.category] || item.category || "Experimental";
  const terms = [...new Set([item.title, category, ...(item.keywords || [])].flatMap((value) => normalize(value).split(/\s+/)).filter(Boolean))];
  return { id: item.id, title: normalize(item.title), category: normalize(category), terms };
});
const payload = JSON.stringify({ schema: 1, documents });
const previewManifest = await readFile("data/preview-manifest.json", "utf8");
const applicationSources = await Promise.all(["index.html", "search-worker.js", "performance-dashboard.js", "styles/source-library-detail.css"].map((file) => readFile(file, "utf8")));
const thumbnailSources = await Promise.all(context.window.SOURCE_LIBRARY.map((item) => readFile(`assets/thumbs/${item.thumb}`)));
const versionHash = createHash("sha256").update(payload).update(previewManifest);
for (const source of applicationSources) versionHash.update(source);
for (const source of thumbnailSources) versionHash.update(source);
const version = versionHash.digest("hex").slice(0, 12);
await writeFile("data/search-index.json", payload + "\n");
await writeFile("data/build-meta.js", `window.SOURCE_ARCHIVE_BUILD=${JSON.stringify({ version, items: documents.length })};\n`);

const precache = ["./", "./index.html", "./search-worker.js", "./performance-dashboard.js", "./data/source-library-data.js", "./data/source-library-youtube-data.js", "./data/search-index.json", "./data/build-meta.js", "./data/preview-manifest.json"];
const serviceWorker = `const VERSION=${JSON.stringify(`source-archive-${version}`)};
const PRECACHE=${JSON.stringify(precache)};
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const retry=(request,attempt=0)=>fetch(request).then(response=>{
    if((response.status===429||response.status>=500)&&attempt<2)return new Promise(resolve=>setTimeout(resolve,250*(attempt+1))).then(()=>retry(request,attempt+1));
    return response;
  });
  const isMetadata=url.pathname.includes('/data/')||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/');
  if(isMetadata){event.respondWith(retry(event.request).then(async response=>{if(response.ok){const copy=response.clone();await caches.open(VERSION).then(cache=>cache.put(event.request,copy))}else{const cached=await caches.match(event.request);if(cached)return cached}return response}).catch(()=>caches.match(event.request)));return}
  if(url.pathname.includes('/assets/thumbs/')){event.respondWith(caches.open(VERSION).then(async cache=>{
    const hit=await cache.match(event.request);
    if(hit&&hit.ok&&String(hit.headers.get('content-type')||'').startsWith('image/'))return hit;
    if(hit)await cache.delete(event.request);
    return retry(event.request).then(async response=>{if(response.ok&&String(response.headers.get('content-type')||'').startsWith('image/'))await cache.put(event.request,response.clone());return response});
  }));}
});
`;
await writeFile("sw.js", serviceWorker);
process.stdout.write(JSON.stringify({ version, documents: documents.length }) + "\n");
