// Tukar nombor versi ini setiap kali fail statik (ikon, manifest) dikemas kini.
const PREFIX = 'maa-pwa-';
const CACHE = PREFIX + 'v4';
const CDN_CACHE = PREFIX + 'cdn-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
// Pustaka luar yang diperlukan untuk berfungsi tanpa internet (imbasan & sambungan).
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Hanya buang cache milik PWA ini — cache sistem utama (maa-web-…) pada domain yang sama tidak disentuh.
      .then(keys => Promise.all(keys.filter(k => (k.startsWith(PREFIX) || k === 'maa-cdn-v1') && k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putCopy(cacheName, req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(cacheName).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1. Halaman HTML: rangkaian dahulu supaya versi terbaru sentiasa dimuatkan apabila ada internet;
  //    salinan simpanan digunakan hanya apabila luar talian.
  const isPage = req.mode === 'navigate' || (url.origin === location.origin && /\.html?$|\/$/.test(url.pathname));
  if (url.origin === location.origin && isPage) {
    e.respondWith(
      fetch(req)
        .then(res => putCopy(CACHE, req, res))
        .catch(() => caches.match(req, { ignoreSearch: true }).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 2. Pustaka CDN (Supabase, ZXing, JsBarcode): guna simpanan serta-merta, kemas kini di latar belakang.
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => putCopy(CDN_CACHE, req, res)).catch(() => cached || Response.error());
        return cached || network;
      })
    );
    return;
  }

  // 3. Fail statik lain dari laman sendiri (ikon, manifest): simpanan dahulu.
  //    Permintaan ke Supabase (API & Storage) tidak disentuh.
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(res => putCopy(CACHE, req, res))).catch(() => Response.error()));
  }
});
