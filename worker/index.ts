/// <reference lib="webworker" />
export default null; // Treat this file as a module

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [100, 50, 100],
        data: {
          url: data.url || 'https://schedule.triddle.dev'
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
  const url = event.notification.data?.url || 'https://schedule.triddle.dev';
  event.waitUntil(
    self.clients.openWindow(url)
  );
});
