/* Service worker do Cofre — cache do app shell + estáticos */
const CACHE = 'cofre-v1';
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase, fontes e CDNs passam direto pela rede
  if (url.origin !== location.origin) return;

  // Navegação: rede primeiro (atualizações chegam logo), cache como fallback offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put('index.html', cp));
        return r;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // Estáticos do site (modelos 3D, silhuetas, ícones): cache primeiro
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
      }
      return r;
    }))
  );
});
