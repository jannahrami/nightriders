// Service Worker: يخزّن ملفات الواجهة فقط ليفتح التطبيق بسرعة.
// لا يخزّن أي بيانات من Supabase أبدًا — البيانات تُجلب مباشرة من الخادم.
// عند نشر نسخة جديدة غيّر رقم VERSION.
const VERSION = 'nr-v1.6.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'assets/css/app.css',
  'assets/img/logo-full.png', 'assets/img/logo-mark.png', 'assets/icons/icon-192-v2.png', 'assets/icons/icon-512-v2.png', 'assets/icons/apple-touch-icon-v2.png',
  'js/app.js', 'js/ui.js', 'js/core.js', 'js/geo.js', 'js/media.js', 'js/components.js', 'js/share-ui.js',
  'js/pages/admin.js', 'js/pages/album.js', 'js/pages/auth.js', 'js/pages/chat.js', 'js/pages/help-new.js',
  'js/pages/help.js', 'js/pages/home.js', 'js/pages/map.js', 'js/pages/member.js', 'js/pages/members.js',
  'js/pages/profile-edit.js', 'js/pages/profile.js', 'js/pages/ride-form.js', 'js/pages/ride.js', 'js/pages/rides.js',
  'js/pages/places.js', 'js/pages/place-form.js', 'js/pages/market.js', 'js/pages/listing.js', 'js/pages/listing-form.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase، الخرائط، الخطوط: بدون تخزين هنا
  if (url.pathname.endsWith('/config.js')) {                 // الإعدادات: من الشبكة دائمًا
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy));
      return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  // ملفات الواجهة: من الذاكرة ثم تحديث في الخلفية
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
