const VERSION="source-archive-1eb4998086ce";
const PRECACHE=["./","./index.html","./search-worker.js","./performance-dashboard.js","./data/source-library-data.js","./data/source-library-youtube-data.js","./data/search-index.json","./data/build-meta.js","./data/preview-manifest.json"];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const isMetadata=url.pathname.includes('/data/')||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/');
  if(isMetadata){event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));return}
  if(url.pathname.includes('/assets/thumbs/')){event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));return response})));}
});
