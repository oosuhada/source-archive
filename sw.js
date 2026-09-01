const VERSION="source-archive-6a1e48082256";
const PRECACHE=["./","./index.html","./search-worker.js","./performance-dashboard.js","./data/source-library-data.js","./data/source-library-youtube-data.js","./data/search-index.json","./data/build-meta.js","./data/preview-manifest.js"];
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
