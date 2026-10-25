/* PokiGbaMon service worker: keeps game files and the page itself on the phone. */
var V = 'v2';
var ROMS = 'pgm-roms-v1';          /* game files, kept until you remove them or the version changes */
var SHELL = 'pgm-shell-' + V;      /* the page, games.json, icons */
var CORE = 'pgm-core-' + V;        /* emulator files from the CDN */
var SCOPE = self.registration.scope;
var SHELL_FILES = ['./', 'index.html', 'games.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL)
      .then(function (c) { return c.addAll(SHELL_FILES.map(function (f) { return new URL(f, SCOPE).href; })); })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return (k.indexOf('pgm-shell-') === 0 && k !== SHELL) || (k.indexOf('pgm-core-') === 0 && k !== CORE);
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req, name, key) {
  return caches.open(name).then(function (c) {
    return fetch(req).then(function (res) {
      if (res && res.ok && res.type !== 'opaque') { c.put(key || req, res.clone()); }
      return res;
    }).catch(function (err) {
      return c.match(key || req).then(function (hit) {
        if (hit) return hit;
        throw err;
      });
    });
  });
}

/* Game files are kept under their plain URL. The page asks for a fresh copy with ?dl=... */
function romResponse(req) {
  var u = new URL(req.url);
  var key = u.origin + u.pathname;
  var fresh = u.search.indexOf('dl=') >= 0;
  return caches.open(ROMS).then(function (c) {
    var first = fresh ? Promise.resolve(null) : c.match(key);
    return first.then(function (hit) {
      if (hit) return hit;
      return fetch(fresh ? new Request(key, { cache: 'reload' }) : req).then(function (res) {
        if (res.ok && res.status === 200) { c.put(key, res.clone()); }
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  var u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.indexOf('/roms/') >= 0) { e.respondWith(romResponse(req)); return; }
    if (req.mode === 'navigate') {
      e.respondWith(networkFirst(req, SHELL, new URL('index.html', SCOPE).href));
      return;
    }
    if (/\/(games\.json|manifest\.webmanifest|icon-\d+\.png)$/.test(u.pathname)) {
      e.respondWith(networkFirst(req, SHELL));
    }
    return;
  }
  if (u.hostname === 'cdn.emulatorjs.org') { e.respondWith(networkFirst(req, CORE)); }
});
