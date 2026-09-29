// Service Worker para o Sistema Financeiro PWA - v2
const CACHE_NAME = 'sistema-financeiro-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css?v=2.0',
  './app.js?v=2.0',
  './manifest.json'
];

// Instalação do Service Worker e atualização forçada
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força o novo service worker a assumir o controlo imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Ativação e limpeza imediata de todos os caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('A apagar cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.clients.claim(); // Reclama o controlo das páginas ativas
    })
  );
});

// Interceção de requisições com prioridade de rede ou cache atualizado
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => {
      // Fallback offline
    })
  );
});