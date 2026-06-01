// ── Lightbox ──
(function() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxClose = document.getElementById('lightboxClose');
    if (!lightbox) return;

    document.addEventListener('click', function(e) {
        const img = e.target.closest('.post-img-clickable');
        if (!img) return;
        e.preventDefault();
        lightboxImg.src = img.dataset.fullImg;
        lightbox.classList.add('active');
    });

    function closeLightbox() {
        lightbox.classList.remove('active');
        lightboxImg.src = '';
    }

    if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
    if (lightbox) lightbox.addEventListener('click', function(e) {
        if (e.target === this) closeLightbox();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeLightbox();
    });
})();

// ── Like handler (event delegation for static + dynamic) ──
document.addEventListener('click', async function(e) {
    const btn = e.target.closest('button.like-btn[data-post-id]');
    if (!btn) return;
    e.preventDefault();

    if (!window.isAuthenticated) {
        alert('Чтобы поставить лайк, необходимо войти в систему');
        window.location.href = window.LOGIN_URL || '/login';
        return;
    }

    const postId = btn.dataset.postId;
    if (!postId) return;

    const likeIcon = btn.querySelector('i');
    const likeCount = btn.querySelector('.like-count');
    const origIcon = likeIcon.className;
    const origText = likeCount.textContent;

    btn.disabled = true;
    likeIcon.className = 'bi bi-arrow-repeat fs-5';

    try {
        const response = await fetch(`/post/${postId}/like`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify({}),
            credentials: 'same-origin'
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = window.LOGIN_URL || '/login';
                return;
            }
            throw new Error('Network response was not ok');
        }

        const data = await response.json();

        if (data.status === 'liked') {
            likeIcon.className = 'bi bi-heart-fill fs-5 text-danger';
            btn.dataset.liked = 'true';
            likeIcon.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.35)', offset: 0.25 },
                { transform: 'scale(0.9)', offset: 0.5 },
                { transform: 'scale(1.1)', offset: 0.75 },
                { transform: 'scale(1)' }
            ], { duration: 450, easing: 'ease-out' });
            btn.classList.remove('like-anim');
            void btn.offsetWidth;
            btn.classList.add('like-anim');
        } else {
            likeIcon.className = 'bi bi-heart fs-5 text-muted';
            btn.dataset.liked = 'false';
        }

        likeCount.textContent = data.likes_count;

    } catch (error) {
        console.error('Error:', error);
        likeIcon.className = origIcon;
        likeCount.textContent = origText;
    } finally {
        btn.disabled = false;
    }
});

// ── Repost handler (event delegation) ──
document.addEventListener('click', async function(e) {
    const btn = e.target.closest('button.repost-btn[data-post-id]');
    if (!btn) return;
    e.preventDefault();

    const postId = btn.dataset.postId;
    const icon = btn.querySelector('i');
    const countEl = btn.querySelector('.repost-count');
    const wasReposted = btn.dataset.reposted === 'true';

    btn.disabled = true;

    try {
        const response = await fetch(`/post/${postId}/repost`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
            },
            credentials: 'same-origin'
        });

        if (!response.ok) throw new Error('Repost failed');

        const data = await response.json();

        if (data.is_reposted) {
            icon.className = 'bi bi-repeat fs-5 text-success';
            btn.dataset.reposted = 'true';
        } else {
            icon.className = 'bi bi-repeat fs-5 text-muted';
            btn.dataset.reposted = 'false';
        }
        countEl.textContent = data.reposts_count;

    } catch (error) {
        console.error('Error reposting:', error);
        icon.className = wasReposted ? 'bi bi-repeat fs-5 text-success' : 'bi bi-repeat fs-5 text-muted';
    } finally {
        btn.disabled = false;
    }
});

// ── Save handler (event delegation) ──
document.addEventListener('click', async function(e) {
    const btn = e.target.closest('button.save-btn[data-post-id]');
    if (!btn) return;
    e.preventDefault();

    const postId = btn.dataset.postId;
    const icon = btn.querySelector('i');
    const wasSaved = btn.dataset.saved === 'true';

    btn.disabled = true;

    try {
        const response = await fetch(`/post/${postId}/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
            },
            credentials: 'same-origin'
        });

        if (!response.ok) throw new Error('Save failed');

        const data = await response.json();

        if (data.is_saved) {
            icon.className = 'bi bi-bookmark-fill fs-5';
            btn.dataset.saved = 'true';
        } else {
            icon.className = 'bi bi-bookmark fs-5';
            btn.dataset.saved = 'false';
        }

    } catch (error) {
        console.error('Error saving post:', error);
        icon.className = wasSaved ? 'bi bi-bookmark-fill fs-5' : 'bi bi-bookmark fs-5';
    } finally {
        btn.disabled = false;
    }
});

// ── Theme toggle ──
(function() {
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
    if (!toggle) return;

    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');

    document.documentElement.setAttribute('data-bs-theme', theme);
    if (icon) icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';

    toggle.addEventListener('click', function() {
        const current = document.documentElement.getAttribute('data-bs-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', next);
        localStorage.setItem('theme', next);
        if (icon) icon.className = next === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
    });
})();

// ── Notifications dropdown ──
(function() {
    const dropdown = document.getElementById('notificationsDropdown');
    const badge = document.getElementById('notificationBadge');
    if (!dropdown) return;

    // Загрузка уведомлений при открытии дропдауна
    dropdown.addEventListener('shown.bs.dropdown', async function() {
        try {
            const response = await fetch('/api/notifications');
            const data = await response.json();
            
            const listContainer = document.getElementById('notificationList');
            if (!listContainer) return;
            
            // Очистить существующий контент
            listContainer.innerHTML = '';
            
            if (data.notifications.length === 0) {
                const emptyItem = document.createElement('li');
                emptyItem.className = 'px-3 py-2 text-center';
                emptyItem.innerHTML = '<p class="text-muted mb-0">Нет новых уведомлений</p>';
                listContainer.appendChild(emptyItem);
            } else {
                data.notifications.forEach(notification => {
                    const notificationHtml = createNotificationHtml(notification);
                    listContainer.insertAdjacentHTML('beforeend', notificationHtml);
                });
            }
            
            // Обновить бейдж
            if (badge) {
                if (data.notifications.length > 0) {
                    badge.textContent = data.notifications.length;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('Error loading notifications:', error);
            const listContainer = document.getElementById('notificationList');
            if (listContainer) {
                listContainer.innerHTML = '<li class="px-3 py-2 text-center"><p class="text-danger mb-0">Ошибка загрузки</p></li>';
            }
        }
    });

    // Создание HTML для уведомления
    function createNotificationHtml(notification) {
        const actorName = notification.actor.username;
        const actorProfile = `/profile/${notification.actor.id}`;
        const postLink = notification.post_id ? `/post/${notification.post_id}` : null;
        
        let message = '';
        let icon = '';
        let iconClass = '';
        
        switch (notification.type) {
            case 'like':
                message = `<a href="${actorProfile}" class="text-decoration-none">${actorName}</a> поставил(а) лайк`;
                icon = 'bi-heart-fill';
                iconClass = 'text-danger';
                break;
            case 'comment':
                message = `<a href="${actorProfile}" class="text-decoration-none">${actorName}</a> оставил(а) комментарий`;
                icon = 'bi-chat-fill';
                iconClass = 'text-primary';
                break;
            case 'follow':
                message = `<a href="${actorProfile}" class="text-decoration-none">${actorName}</a> подписался(ась) на вас`;
                icon = 'bi-person-plus-fill';
                iconClass = 'text-success';
                break;
        }
        
        const postLinkHtml = postLink ? ` к <a href="${postLink}" class="text-decoration-none">вашему посту</a>` : '';
        
        return `
            <li class="notification-item ${notification.is_read ? 'read' : 'unread'}" data-id="${notification.id}">
                <div class="d-flex align-items-start">
                    <div class="flex-shrink-0">
                        <img src="${notification.actor.profile_image ? `/static/uploads/profile_images/${notification.actor.profile_image}` : '/static/default-profile.png'}"
                             alt="${actorName}" width="32" height="32" class="rounded-circle">
                    </div>
                    <div class="flex-grow-1 ms-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <p class="mb-1 ${notification.is_read ? '' : 'fw-bold'}">
                                    ${message}${postLinkHtml}
                                </p>
                                <small class="text-muted">${formatDate(notification.created_date)}</small>
                            </div>
                            ${!notification.is_read ? `
                                <button class="btn btn-sm btn-outline-secondary mark-read-btn" data-id="${notification.id}">
                                    <i class="bi bi-check"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </li>
        `;
    }

    // Форматирование даты
    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'только что';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} минут назад`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} часов назад`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} дней назад`;
        
        return date.toLocaleDateString('ru-RU');
    }

    // Обработка клика по кнопке "отметить прочитанным"
    document.addEventListener('click', function(e) {
        if (e.target.closest('.mark-read-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.mark-read-btn');
            const notificationId = btn.dataset.id;
            
            markNotificationRead(notificationId, btn);
        }
    });

    // Отметить уведомление как прочитанное
    async function markNotificationRead(notificationId, button) {
        try {
            const response = await fetch(`/notifications/${notificationId}/mark-read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                }
            });
            
            if (response.ok) {
                const notificationItem = button.closest('.notification-item');
                notificationItem.classList.remove('unread');
                notificationItem.classList.add('read');
                button.remove();
                
                // Обновить бейдж
                updateNotificationBadge();
            }
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    // Обновить счётчик уведомлений
    async function updateNotificationBadge() {
        if (!badge) return;
        
        try {
            const response = await fetch('/api/notifications/unread-count');
            const data = await response.json();
            
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        } catch (error) {
            console.error('Error updating notification badge:', error);
        }
    }

    // Инициализация при загрузке страницы
    if (window.isAuthenticated) {
        updateNotificationBadge();
    }
})();

// ── In-page toast уведомления ──
window.showToast = function(title, message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const id = 'toast-' + Date.now();
    const bgClass = type === 'danger' ? 'bg-danger text-white' :
                    type === 'success' ? 'bg-success text-white' :
                    type === 'info' ? 'bg-info' :
                    'bg-dark text-white';
    const html = `
        <div id="${id}" class="toast align-items-center ${bgClass} border-0 mb-2" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    <strong>${title}</strong><br>
                    <small>${message}</small>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(id);
    const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
};

// ── Браузерные уведомления (всегда) ──
(function() {
    let lastBadgeCount = 0;

    // Запрашиваем разрешение при первом клике
    document.addEventListener('click', function() {
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, { once: true });

    // Следим за изменением бейджа уведомлений (каждые 10с)
    setInterval(async function() {
        if (!window.isAuthenticated) return;
        try {
            const response = await fetch('/api/notifications/unread-count');
            const data = await response.json();
            if (data.count > lastBadgeCount) {
                // Всегда показываем уведомление (и тост, и браузерное)
                showToast('Rugram', 'У вас новые уведомления');
                window._showBrowserNotification('Rugram', 'У вас новые уведомления');
            }
            lastBadgeCount = data.count;
            // Синхронизируем бейдж в шапке
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                if (data.count > 0) {
                    badge.textContent = data.count;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) {}
    }, 10000);
})();

// Глобальная функция для браузерных уведомлений (всегда)
window._showBrowserNotification = function(title, body, tag) {
    if (Notification.permission === 'granted') {
        try {
            const n = new Notification(title, {
                body: body,
                tag: tag || 'rugram',
                silent: false
            });
            setTimeout(() => n.close(), 5000);
        } catch (e) {}
    }
};

// Глобальная функция для показа уведомлений (вызывается из чата)
window.showBrowserNotification = function(title, body) {
    // Показываем и тост, и браузерное уведомление
    showToast(title, body);
    window._showBrowserNotification(title, body);
};

// ── Push-уведомления (Service Worker) ──
(function() {
    // Конвертирует VAPID public key (base64url string) в Uint8Array
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function subscribeToPush() {
        try {
            // Ждём регистрацию SW
            const registration = await navigator.serviceWorker.ready;

            // Конвертируем VAPID ключ в Uint8Array
            const applicationServerKey = urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY);

            // Подписываемся на push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });

            // Отправляем подписку на сервер
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify({
                    subscription: subscription.toJSON()
                })
            });

        } catch (error) {
            if (error.name === 'NotAllowedError') {
                console.log('Push permission denied');
            } else if (error.name === 'InvalidStateError') {
                // Уже подписан — обновим подписку
                try {
                    const registration = await navigator.serviceWorker.ready;
                    const existingSub = await registration.pushManager.getSubscription();
                    if (existingSub) {
                        await fetch('/api/push/subscribe', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                            },
                            body: JSON.stringify({
                                subscription: existingSub.toJSON()
                            })
                        });
                    }
                } catch (e) {
                    console.error('Push resubscribe error:', e);
                }
            } else {
                console.error('Push subscribe error:', error);
            }
        }
    }

    // Запускаем подписку при первой возможности
    if ('serviceWorker' in navigator && 'PushManager' in window && window.isAuthenticated && window.VAPID_PUBLIC_KEY) {
        // Запрашиваем разрешение при первом клике
        const clickHandler = async function() {
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    subscribeToPush();
                }
            } else if (Notification.permission === 'granted') {
                subscribeToPush();
            }
            document.removeEventListener('click', clickHandler);
        };
        document.addEventListener('click', clickHandler);

        // Если разрешение уже есть — подписываемся сразу
        if (Notification.permission === 'granted') {
            setTimeout(subscribeToPush, 1000); // Небольшая задержка чтобы SW успел
        }
    }
})();
