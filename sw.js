// オフライン用のキャッシュ。アプリを更新したら VERSION を変える。
const VERSION = 'v1';
const CACHE = 'plot-editor-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'lib/marked.min.js',
  'js/app.js',
  'js/db.js',
  'js/dnd.js',
  'js/fileio.js',
  'js/leftpane.js',
  'js/mdformat.js',
  'js/model.js',
  'js/nav.js',
  'js/store.js',
  'js/ui.js',
  'js/util.js',
  'js/view-body.js',
  'js/view-episodes.js',
  'js/view-settings.js',
  'js/view-structure.js',
  'js/widgets.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('plot-editor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// キャッシュにあればそれを使い、なければネットから取る
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)),
  );
});
