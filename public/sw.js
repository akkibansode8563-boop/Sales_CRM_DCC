const CACHE_NAME = 'dcc-salesforce-v8';
const STATIC_ASSETS = ['/', '/index.html', '/offline.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'map-tiles-v4').map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('nominatim.openstreetmap.org')) return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open('map-tiles-v4').then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => { cache.put(e.request, res.clone()); return res; }).catch(() => cached);
        })
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match('/offline.html'));
    })
  );
});

self.addEventListener('push', e => {
  let data = { title: 'DCC SalesForce', body: 'You have a new notification' };
  try { data = e.data ? JSON.parse(e.data.text()) : data; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon: '/icons/icon-192.png', badge: '/icons/icon-72.png',
      vibrate: [200, 100, 200], data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wcs => {
      for (const c of wcs) { if (c.url === url && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type !== 'SCHEDULE_DAILY_REMINDER') return;
  const name = e.data.managerName || 'Sales Manager';
  const now = new Date();
  if (now.getDay() === 0) return;
  const target = new Date();
  target.setUTCHours(5, 30, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  setTimeout(() => {
    if (new Date().getDay() === 0) return;
    self.registration.showNotification('DCC SalesForce — Good Morning!', {
      body: name + ', start your journey and log visits today.',
      icon: '/icons/icon-192.png', badge: '/icons/icon-72.png',
      vibrate: [200, 100, 200], data: '/',
    });
  }, target - now);
});
