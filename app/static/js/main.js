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

// ── Theme toggle ──
(function() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-bs-theme', theme);

    toggle.addEventListener('click', function() {
        const current = document.documentElement.getAttribute('data-bs-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', next);
        localStorage.setItem('theme', next);
    });
})();

// ── Notification badge polling ──
(function() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    async function updateBadge() {
        if (!window.isAuthenticated) return;
        try {
            const r = await fetch(window.API_NOTIFICATIONS_UNREAD_URL, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const data = await r.json();
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {}
    }

    // Initial check + poll every 10s
    updateBadge();
    setInterval(updateBadge, 10000);
})();

// ── Toast helper (Bootstrap-independent) ──
window.showToast = function(title, message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const id = 'toast-' + Date.now();
    const colors = {
        danger: 'var(--red)',
        success: 'var(--green)',
        info: 'var(--blue)',
    };
    const border = colors[type] || 'var(--border)';
    const html = `
        <div id="${id}" style="background:var(--bg);border:1px solid ${border};border-radius:4px;padding:8px 12px;margin-bottom:6px;font-family:var(--font);max-width:360px;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:auto;">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
                <div>
                    <strong style="color:${border}">${escapeHtml(title)}</strong><br>
                    <small style="color:var(--fg)">${escapeHtml(message)}</small>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:var(--fg);cursor:pointer;font-size:1.2em">&times;</button>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.remove();
    }, 5000);
};

// ── Notification request banner ──
(function() {
    if (!window.isAuthenticated) return;
    if (!('Notification' in window)) return;

    const PERMISSION_KEY = 'rugram_notification_permission';
    const stored = localStorage.getItem(PERMISSION_KEY);

    // Already granted at browser level — enable push
    if (Notification.permission === 'granted') {
        localStorage.setItem(PERMISSION_KEY, 'granted');
        enablePush();
        return;
    }

    // Browser-level denied — show blocked banner with re-enable instructions
    if (Notification.permission === 'denied') {
        const blockedShown = sessionStorage.getItem('rugram_notif_blocked_shown');
        if (!blockedShown) {
            showBlockedBanner();
        }
        return;
    }

    // Permission is 'default' — check localStorage to decide if we show the banner
    if (stored === 'denied' || stored === 'dismissed') return;
    showBanner();

    function showBlockedBanner() {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const id = 'notif-blocked-banner';
        if (document.getElementById(id)) return;

        const html = `
            <div id="${id}" style="background:var(--bg);border:1px solid var(--red);padding:8px 12px;margin-bottom:6px;font-family:var(--font);max-width:360px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border-left:3px solid var(--red);pointer-events:auto;">
                <div style="display:flex;gap:8px;align-items:flex-start">
                    <span style="color:var(--red);font-weight:700;flex-shrink:0">[✗]</span>
                    <div>
                        <div style="color:var(--text);font-size:0.82rem;margin-bottom:2px"><strong>notifications blocked in browser</strong></div>
                        <div style="color:var(--subtle);font-size:0.72rem;margin-bottom:6px">to re-enable, click the lock icon in the URL bar → Site Settings → Notifications → Allow, then reload the page</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                            <button class="btn-term" id="notifBlockedGotIt" style="padding:2px 10px;font-size:0.72rem">[got it]</button>
                            <button class="btn-term primary" id="notifBlockedRecheck" style="padding:2px 10px;font-size:0.72rem">[re-check]</button>
                        </div>
                    </div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);

        document.getElementById('notifBlockedGotIt').addEventListener('click', function() {
            sessionStorage.setItem('rugram_notif_blocked_shown', '1');
            const banner = document.getElementById(id);
            if (banner) banner.remove();
        });

        document.getElementById('notifBlockedRecheck').addEventListener('click', async function() {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    localStorage.setItem(PERMISSION_KEY, 'granted');
                    enablePush();
                    showToast('[*] notifications enabled', 'push notifications are now active', 'success');
                    const banner = document.getElementById(id);
                    if (banner) banner.remove();
                } else {
                    showToast('[!] still blocked', 'change site permission and reload the page', 'danger');
                }
            } catch (e) { console.error(e); }
        });
    }

    function showBanner() {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const id = 'notif-banner';
        if (document.getElementById(id)) return;

        const html = `
            <div id="${id}" style="background:var(--bg);border:1px solid var(--overlay);padding:8px 12px;margin-bottom:6px;font-family:var(--font);max-width:360px;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:auto;">
                <div style="display:flex;gap:8px;align-items:flex-start">
                    <span style="color:var(--green);font-weight:700;flex-shrink:0">[!]</span>
                    <div>
                        <div style="color:var(--text);font-size:0.82rem;margin-bottom:2px"><strong>enable push notifications?</strong></div>
                        <div style="color:var(--subtle);font-size:0.72rem;margin-bottom:8px">get notified when someone interacts with you</div>
                        <div style="display:flex;gap:6px">
                            <button class="btn-term primary" id="notifAllowBtn" style="padding:2px 10px;font-size:0.72rem">[yes]</button>
                            <button class="btn-term secondary" id="notifLaterBtn" style="padding:2px 10px;font-size:0.72rem">[later]</button>
                        </div>
                    </div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);

        document.getElementById('notifAllowBtn').addEventListener('click', async function() {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    localStorage.setItem(PERMISSION_KEY, 'granted');
                    enablePush();
                    showToast('[*] notifications enabled', 'you will now receive push notifications', 'success');
                } else {
                    localStorage.setItem(PERMISSION_KEY, 'denied');
                    showToast('[!] notifications denied', 'change in browser settings to re-enable', 'danger');
                }
            } catch (e) { console.error(e); }
            const banner = document.getElementById(id);
            if (banner) banner.remove();
        });

        document.getElementById('notifLaterBtn').addEventListener('click', function() {
            localStorage.setItem(PERMISSION_KEY, 'dismissed');
            const banner = document.getElementById(id);
            if (banner) banner.remove();
        });
    }

    async function enablePush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return; // push not supported — silently skip
        }
        if (!window.VAPID_PUBLIC_KEY || window.VAPID_PUBLIC_KEY.length < 20) {
            return; // VAPID not configured — silently skip (push is optional)
        }
        function urlBase64ToUint8Array(b64) {
            const padding = '='.repeat((4 - b64.length % 4) % 4);
            const base64 = (b64 + padding).replace(/\-/g, '+').replace(/_/g, '/');
            const raw = window.atob(base64);
            const arr = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            return arr;
        }
        try {
            const reg = await navigator.serviceWorker.ready;
            let sub;
            try {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
                });
            } catch (err) {
                if (err.name === 'InvalidStateError') {
                    sub = await reg.pushManager.getSubscription();
                } else throw err;
            }
            if (sub) {
                await fetch(window.API_PUSH_SUBSCRIBE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                    },
                    body: JSON.stringify({ subscription: sub.toJSON() })
                });
            }
        } catch (e) {
            console.error('Push setup error:', e);
        }
    }
})();

// ── Browser notification helper ──
function sendBrowserNotification(title, body, tag) {
    if (Notification.permission === 'granted') {
        try {
            const n = new Notification(title, { body: body, tag: tag || 'rugram' });
            setTimeout(() => n.close(), 5000);
        } catch (e) {}
    }
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Global notification function for chat
window.showBrowserNotification = function(title, body) {
    showToast(title, body);
    sendBrowserNotification(title, body);
};

// ── Post actions (like / save / repost) — delegated ──
(function() {
    function getCsrf() {
        var m = document.querySelector('meta[name="csrf-token"]');
        return m ? m.content : '';
    }

    document.addEventListener('click', function(e) {
        // Like
        var btn = e.target.closest('.like-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            if (!window.isAuthenticated) { window.location.href = window.LOGIN_URL; return; }
            var postId = btn.dataset.postId;
            btn.innerHTML = '<span style="opacity:0.5">...</span>';
            var url = window.LIKE_URL.replace('/0/', '/' + postId + '/');
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': getCsrf() },
                body: '{}', credentials: 'same-origin'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                btn.dataset.liked = data.status === 'liked' ? 'true' : 'false';
                btn.classList.toggle('liked', data.status === 'liked');
                var count = data.likes_count > 0 ? ' ' + data.likes_count : '';
                btn.innerHTML = '[♥' + count + ' like]';
            })
            .catch(function() { btn.innerHTML = '[♥ like]'; });
            return;
        }

        // Save
        btn = e.target.closest('.save-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            if (!window.isAuthenticated) { window.location.href = window.LOGIN_URL; return; }
            var postId = btn.dataset.postId;
            btn.innerHTML = '<span style="opacity:0.5">...</span>';
            var url = window.SAVE_URL.replace('/0/', '/' + postId + '/');
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': getCsrf() },
                body: '{}', credentials: 'same-origin'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                btn.dataset.saved = data.is_saved ? 'true' : 'false';
                btn.innerHTML = data.is_saved ? '[◆ save]' : '[◇ save]';
            })
            .catch(function() { btn.innerHTML = '[◇ save]'; });
            return;
        }

        // Repost
        btn = e.target.closest('.repost-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            if (!window.isAuthenticated) { window.location.href = window.LOGIN_URL; return; }
            var postId = btn.dataset.postId;
            btn.innerHTML = '<span style="opacity:0.5">...</span>';
            var url = window.REPOST_URL.replace('/0/', '/' + postId + '/');
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': getCsrf() },
                body: '{}', credentials: 'same-origin'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                btn.dataset.reposted = data.reposted ? 'true' : 'false';
                var count = data.reposts_count > 0 ? ' ' + data.reposts_count : '';
                btn.innerHTML = '[↻' + count + ' repost]';
            })
            .catch(function() { btn.innerHTML = '[↻ repost]'; });
        }
    });
})();

// ── Delete Post (shared by profile.html, post.html) ──
window.deletePost = function(postId) {
    if (!confirm('Delete post?')) return;
    var url = window.DELETE_POST_URL.replace('/0', '/' + postId);
    fetch(url, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': getCsrf(), 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    })
    .then(function(r) {
        if (r.ok) window.location.reload();
        else if (r.status === 401) window.location.href = window.LOGIN_URL;
        else alert('Error');
    })
    .catch(function() { alert('Error'); });
};

// ── Online-status heartbeat (every 15s, no DB write) ──
(function() {
    function ping() {
        fetch('/api/v1/ping', { method: 'POST', headers: { 'X-CSRFToken': getCsrf() } })
            .catch(function() {});
    }
    ping();
    setInterval(ping, 15000);
})();
