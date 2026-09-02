importScripts('data/hls-boot-pack-manifest.js');
const VERSION="source-archive-hlsboot-v1";
const BOOT_CACHE="source-archive-hlsboot-packs-v1";
const PRECACHE=["./","./index.html","./search-worker.js","./performance-dashboard.js","./data/source-library-data.js","./data/source-library-youtube-data.js","./data/search-index.json","./data/build-meta.js","./data/preview-manifest.js","./data/hls-boot-pack-manifest.js"];
const ROOT=new URL('./',self.location).pathname;
const REMOTE_HLS='https://source-media.oosu.dev/hls/';
const bootMemory=new Map();
const packUrl=pack=>new URL(`assets/hls-boot-packs/${pack}`,self.location).href;
function parseBootPack(buffer){const bytes=new Uint8Array(buffer),view=new DataView(buffer);if(new TextDecoder().decode(bytes.slice(0,8))!=='SAHLSB01')throw new Error('Invalid HLS boot pack');const entries=view.getUint32(8,true),files=new Map();let cursor=12;for(let index=0;index<entries;index+=1){const length=view.getUint16(cursor,true);cursor+=2;const name=new TextDecoder().decode(bytes.slice(cursor,cursor+length));cursor+=length;const offset=view.getUint32(cursor,true),size=view.getUint32(cursor+4,true);cursor+=8;files.set(name,bytes.slice(offset,offset+size))}return files}
async function loadBootPack(pack){if(bootMemory.has(pack))return bootMemory.get(pack);const task=(async()=>{const cache=await caches.open(BOOT_CACHE);let response=await cache.match(packUrl(pack));if(!response){response=await fetch(packUrl(pack),{cache:'force-cache'});if(!response.ok)throw new Error(`boot pack ${response.status}`);await cache.put(packUrl(pack),response.clone())}return parseBootPack(await response.arrayBuffer())})();bootMemory.set(pack,task);return task}
async function preloadBootPacks(){const packs=[...new Set(Object.values(self.SOURCE_ARCHIVE_HLS_BOOT_PACKS||{}))];let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<packs.length){const pack=packs[next++];try{await loadBootPack(pack)}catch{}}}))}
function hlsMaster(){return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=275000,RESOLUTION=180x102,CODECS="avc1.64000c"\nvlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=550000,RESOLUTION=360x202,CODECS="avc1.64000d"\nvhigh/index.m3u8\n'}
function hlsPlaylist(){const segments=Array.from({length:5},(_,index)=>`#EXTINF:2.000000,\nseg_${String(index).padStart(3,'0')}.ts`).join('\n');return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n${segments}\n#EXT-X-ENDLIST\n`}
function bootResponse(bytes,request){const range=request.headers.get('range');if(!range)return new Response(bytes,{headers:{'Content-Type':'video/mp2t','Content-Length':String(bytes.byteLength),'Cache-Control':'public, max-age=31536000, immutable'}});const match=/bytes=(\d*)-(\d*)/.exec(range);if(!match)return new Response(null,{status:416});const start=match[1]?Number(match[1]):0,end=match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'video/mp2t','Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,'Accept-Ranges':'bytes','Content-Length':String(end-start+1)}})}
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='preload-hls-boot')event.waitUntil(preloadBootPacks())});
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION&&key!==BOOT_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.startsWith(`${ROOT}hls-preview/`)){
    const parts=url.pathname.slice(`${ROOT}hls-preview/`.length).split('/'),clip=parts[0],rest=parts.slice(1).join('/');
    event.respondWith((async()=>{
      if(rest==='master.m3u8')return new Response(hlsMaster(),{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
      if(rest==='vlow/index.m3u8'||rest==='vhigh/index.m3u8')return new Response(hlsPlaylist(),{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
      if(rest==='vlow/seg_000.ts'){const pack=self.SOURCE_ARCHIVE_HLS_BOOT_PACKS?.[clip],bytes=pack&&(await loadBootPack(pack)).get(`${clip}.ts`);if(bytes)return bootResponse(bytes,event.request)}
      return fetch(`${REMOTE_HLS}${clip}/${rest}`,{headers:event.request.headers});
    })());return;
  }
  const retry=(request,attempt=0)=>fetch(request).then(response=>{
    if((response.status===429||response.status>=500)&&attempt<2)return new Promise(resolve=>setTimeout(resolve,250*(attempt+1))).then(()=>retry(request,attempt+1));
    return response;
  });
  const isMetadata=url.pathname.includes('/data/')||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/');
  if(isMetadata){event.respondWith(retry(event.request).then(async response=>{if(response.ok){const copy=response.clone();await caches.open(VERSION).then(cache=>cache.put(event.request,copy))}else{const cached=await caches.match(event.request);if(cached)return cached}return response}).catch(()=>caches.match(event.request)));return}
  if(url.pathname.includes('/assets/thumbs/')||url.pathname.includes('/assets/thumbs-low/')||url.pathname.includes('/assets/thumbs-medium/')||url.pathname.includes('/assets/thumbs-360/')){event.respondWith(caches.open(VERSION).then(async cache=>{
    const hit=await cache.match(event.request);
    if(hit&&hit.ok&&String(hit.headers.get('content-type')||'').startsWith('image/'))return hit;
    if(hit)await cache.delete(event.request);
    return retry(event.request).then(async response=>{if(response.ok&&String(response.headers.get('content-type')||'').startsWith('image/'))await cache.put(event.request,response.clone());return response});
  }));}
});
