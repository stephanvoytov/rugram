// Rugram Service Worker — Push Notifications
const CACHE_NAME = 'rugram-v1';
const BASE_URL = self.location.origin;

// Установка — кешируем базовые ресурсы
self.addEventListener('install', event => {
    self.skipWaiting();
});

// Активация — удаляем старые кеши
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

// Обработка входящих push-уведомлений
self.addEventListener('push', event => {
    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        try {
            data = { title: 'Rugram', body: event.data.text() };
        } catch (e2) {
            data = { title: 'Rugram', body: 'Новое уведомление' };
        }
    }

    const title = data.title || 'Rugram';
    const options = {
        body: data.body || 'Новое уведомление',
        icon: data.icon || '/static/favicon/android-chrome-192x192.png',
        badge: '/static/favicon/favicon-32x32.png',
        tag: data.tag || 'rugram-default',
        data: {
            url: data.url || '/',
            type: data.type || 'notification',
            chatId: data.chatId || null,
            notificationId: data.notificationId || null
        },
        vibrate: [200, 100, 200],
        silent: false,
        requireInteraction: true
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
    const notification = event.notification;
    notification.close();

    const targetUrl = notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Если уже есть открытая вкладка Rugram — используем её
                for (const client of windowClients) {
                    if (client.url.includes(BASE_URL) && 'focus' in client) {
                        return client.focus().then(client => {
                            client.navigate(targetUrl);
                        });
                    }
                }
                // Иначе открываем новую
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});
