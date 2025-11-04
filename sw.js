/**
 * Service Worker for automatic cache-busting of all JavaScript modules
 */

console.log('[Service Worker] Loading sw.js');

// Install immediately
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing');
    self.skipWaiting();
});

// Activate immediately
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating');
    event.waitUntil(self.clients.claim());
});

// Intercept all fetch requests
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept JS module requests from /src/
    if (url.pathname.includes('/src/') && url.pathname.endsWith('.js')) {
        console.log('[Service Worker] Intercepting:', url.pathname);

        // Add version parameter if not already present
        if (!url.searchParams.has('v')) {
            url.searchParams.set('v', Date.now());
            console.log('[Service Worker] Added version to:', url.href);
        }

        // Fetch with the versioned URL, bypassing cache, and add no-cache headers to response
        event.respondWith(
            fetch(url, { cache: 'no-store' }).then(response => {
                // Clone the response and add cache-busting headers
                const newHeaders = new Headers(response.headers);
                newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                newHeaders.set('Pragma', 'no-cache');
                newHeaders.set('Expires', '0');

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders
                });
            })
        );
        return;
    }

    // Pass through all other requests
    event.respondWith(fetch(event.request));
});
