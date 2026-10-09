const CACHE='meu-financeiro-shell-v43';
const SHELL=['./','index.html','styles.css?v=43','js/app.js?v=43','js/finance.js','js/repository.js','js/firebase-config.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/brand-nunes.svg','icons/brand-nunes-dark.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('index.html',copy));return response;}).catch(()=>caches.match('index.html')));return;
  }
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request)));
});