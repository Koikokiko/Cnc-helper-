/* CNC помощник — service worker (v142.30, 26.11.2026).
   Есть сеть — берётся свежая версия с GitHub Pages; нет сети или она не отвечает — сохранённая копия.
   CACHE_NAME менять при каждом выпуске не нужно. */
var PREFIX = 'cnc-helper-';
var CACHE_NAME = PREFIX + 'v142.30';
var CORE = ['./', './index.html', './manifest.json', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './favicon-32.png'];
var CDN = 'https://cdn.jsdelivr.net/npm/occt-import-js@';   // модуль STEP, версия в адресе закреплена

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) {
    // по одному: отсутствующий файл не должен ломать установку
    return Promise.all(CORE.map(function (u) {
      return fetch(u, { cache: 'no-cache' }).then(function (r) {
        if (r.ok && !r.redirected) return c.put(u, r);
      }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // удаляются только свои старые кэши: на том же адресе github.io могут быть другие приложения
    return Promise.all(keys.filter(function (k) {
      return k.indexOf(PREFIX) === 0 && k !== CACHE_NAME;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function save(key, res) {
  var copy = res.clone();
  return caches.open(CACHE_NAME).then(function (c) { return c.put(key, copy); }).catch(function () {});
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  if (req.url.indexOf(CDN) === 0) {                          // сначала копия
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) e.waitUntil(save(req, res));
        return res;
      });
    }));
    return;
  }
  if (req.url.indexOf(self.registration.scope) !== 0) return; // чужие адреса не трогаем

  var isPage = req.mode === 'navigate';
  function fromCache() {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (isPage ? caches.match('./index.html') : undefined);
    });
  }
  var net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
    if (res.redirected) return Response.redirect(res.url);
    if (res.status === 200) e.waitUntil(save(req.url.split('?')[0], res));
    return res;
  });
  e.waitUntil(net.catch(function () {}));

  e.respondWith(new Promise(function (resolve, reject) {
    // слабая сеть: через 4 секунды отдаём копию, если она есть
    var timer = setTimeout(function () {
      fromCache().then(function (hit) { if (hit) resolve(hit); });
    }, 4000);
    net.then(function (res) {
      clearTimeout(timer);
      if (res.status >= 500) return fromCache().then(function (hit) { resolve(hit || res); });
      resolve(res);
    }).catch(function (err) {
      clearTimeout(timer);
      fromCache().then(function (hit) { if (hit) resolve(hit); else reject(err); });
    });
  }));
});
