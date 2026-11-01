/**
 * Service Worker for Tiptur Health Care Hub
 * Provides offline hospital search, caching of hospital dataset, and assets.
 * Explicitly DOES NOT cache authentication endpoints (/login, /register, /logout).
 */

const CACHE_NAME = 'tiptur-health-hub-v2';

const STATIC_ASSETS = [
  '/static/css/style.css',
  '/static/data/hospitals.json',
  '/static/manifest.json',
  '/static/js/offline-gps.js',
  '/static/js/voice-assistant.js'
];

const ESSENTIAL_PAGES = [
  '/dashboard.html',
  '/home.html',
  '/about.html',
  '/hospital.html',
  '/govt-hospital.html',
  '/mudra-hospital.html',
  '/ct-mudra.html',
  '/vaibhavi.html',
  '/sunanda-eye.html',
  '/shekhar-hospital.html',
  '/kumar.html',
  '/jenukal-nursing.html',
  '/venkateshwara.html',
  '/ss-hospital.html',
  '/balaji-hospital.html',
  '/jyothi-nethralaya.html',
  '/tiptur-dental.html',
  '/hemanth-dental.html',
  '/sannidhi-clinic.html',
  '/sri-ranga.html',
  '/chethana-hospital.html',
  '/arogya-mandira.html'
];

// Install: Cache static assets and essential pages
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache assets safely
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {
          console.warn('SW failed to cache asset:', asset, e);
        }
      }
      for (const page of ESSENTIAL_PAGES) {
        try {
          await cache.add(page);
        } catch (e) {
          console.warn('SW failed to cache page:', page, e);
        }
      }
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Never cache auth routes, cache-first for static/data, network-first for navigation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache private auth routes or API key requests
  if (
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/logout' ||
    url.pathname.startsWith('/api/voice-assistant')
  ) {
    return; // Pass through to network
  }

  // 2. Cache-first for hospital JSON data and static scripts/styles
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Network-first with cache fallback for HTML pages
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('/dashboard.html');
          if (fallback) return fallback;
          return new Response('<h1>Offline - Tiptur Health Care Hub</h1><p>Please connect to internet or use the locally cached dashboard.</p>', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }
});
