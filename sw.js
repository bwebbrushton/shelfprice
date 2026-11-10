// Offline support: the app shell and the label scanner are stored on the phone.
const APP_CACHE = 'shelfprice-app-v1';
const OCR_CACHE = 'shelfprice-ocr'; // big files; kept across app updates

const APP_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'ocr.js', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
const OCR_FILES = [
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/lang/eng.traineddata',
  'vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_FILES);
    // Scanner files: best effort, so a slow connection doesn't block install.
    const ocr = await caches.open(OCR_CACHE);
    await Promise.all(OCR_FILES.map(async (f) => {
      const url = new URL(f, self.registration.scope).href;
      if (!(await ocr.match(url))) await ocr.add(url).catch(() => {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== APP_CACHE && k !== OCR_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // e.g. Google Sheets upload

  if (url.pathname.includes('/vendor/tesseract/')) {
    // Scanner: cache first, these files never change.
    event.respondWith((async () => {
      const cache = await caches.open(OCR_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // App shell: network first (so updates arrive), fall back to cache when offline.
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
