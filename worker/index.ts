/// <reference lib="webworker" />
export default null; // Treat this file as a module

declare const self: ServiceWorkerGlobalScope;

const SITE_URL = 'https://schedule.triddle.dev';

self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        // The only icon asset the app ships; `/icon.png` does not exist.
        icon: '/icons/icon.jpg',
        badge: '/icons/icon.jpg',
        vibrate: [100, 50, 100],
        data: {
          url: data.url || SITE_URL
        }
      };
      event.waitUntil(self.registration.showNotification(data.title, options));
    } catch (e) {
      console.error('Push event data is not valid JSON:', e);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || SITE_URL;
  // Focus a window that already has the app open rather than stacking new ones.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.startsWith(SITE_URL));
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
