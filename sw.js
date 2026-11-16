// Service worker — Perpustakaan Mini (sistem utama / versi web)
// Tukar nombor versi apabila ikon atau manifest dikemas kini. Halaman HTML sentiasa dimuat terus dari internet jika ada.
const PREFIX = 'maa-web-';
const CACHE = PREFIX + 'v1';
const CDN_CACHE = PREFIX + 'cdn-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
// Pustaka luar yang diperlukan: Supabase (sync) dan JsBarcode (barkod pada cetakan rekod buku).
const CDN_HOSTS = ['cdn.jsdelivr.net'];
// Cache lama daripada sw.js versi asal (nama sama dengan PWA) — dibuang sekali sahaja.
const LEGACY = ['maa-pwa-readonly-v2'];

self.addEventListener('install', e => {
  // Setiap fail disimpan berasingan: jika satu fail tiada (contoh: nama halaman berbeza), pemasangan tetap berjaya.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Hanya buang cache milik sistem ini — cache PWA pada domain yang sama tidak disentuh.
      .then(keys => Promise.all(keys.filter(k => (k.startsWith(PREFIX) && k !== CACHE && k !== CDN_CACHE) || LEGACY.includes(k)).map(k => caches.delete(k))))
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

  // 1. Halaman: internet dahulu (sentiasa versi terbaru), salinan simpanan apabila luar talian.
  const isPage = req.mode === 'navigate' || (url.origin === location.origin && /\.html?$|\/$/.test(url.pathname));
  if (url.origin === location.origin && isPage) {
    e.respondWith(
      fetch(req)
        .then(res => putCopy(CACHE, req, res))
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(c => c || caches.match('./index.html'))
          .then(c => c || caches.match('./'))
          .then(c => c || Response.error()))
    );
    return;
  }

  // 2. Pustaka CDN: guna simpanan serta-merta, kemas kini di latar belakang.
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => putCopy(CDN_CACHE, req, res)).catch(() => cached || Response.error());
        return cached || network;
      })
    );
    return;
  }

  // 3. Fail statik laman sendiri (ikon, manifest): simpanan dahulu.
  //    Permintaan ke Supabase (pangkalan data & Storage) tidak disentuh.
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(res => putCopy(CACHE, req, res))).catch(() => Response.error()));
  }
});
