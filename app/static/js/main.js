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
