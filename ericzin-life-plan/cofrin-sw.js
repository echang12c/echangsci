/* Service worker do Meu Cofrin dentro do LifePlan — só o push das metas do dia.
   Sem cache de propósito: o LifePlan é um arquivo só e deve sempre vir fresco da rede. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* Web Push: mostra a notificação enviada pelo worker cofre-notifier */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || '🔔 Meu Cofrin', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: 'cofrin-icon.png',
    badge: 'cofrin-icon.png',
    data: { url: './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return clients.openWindow('./');
    })
  );
});
