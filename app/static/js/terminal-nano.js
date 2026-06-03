// ── Rugram Terminal — Nano Editor (VFS-powered) ──
// Path resolution via T.vfs.resolve()
(function(T) {
  'use strict';

  // ── COMMAND: nano <path> ──
  T.cmdNano = function(args) {
    args = (args || '').trim();

    // Без аргументов: если мы в create — открыть новый пост
    if (!args) {
      T.cmdCreate();
      return;
    }

    // ── VFS resolution ──
    var node = T.vfs.resolve(args);
    if (!node || node.error) {
      T.addOutputLine('<span class="tp-err">nano: ' + T.escapeHtml(args) + ': No such file</span>');
      T.addOutputLine('<span class="tp-desc">  # ' + T._('файлы: posts/&lt;id&gt;.post, profile/info, drafts/&lt;file&gt;', 'files: posts/&lt;id&gt;.post, profile/info, drafts/&lt;file&gt;') + '</span>');
      return;
    }

    if (node.type !== 'file') {
      T.addOutputLine('<span class="tp-err">nano: ' + T.escapeHtml(args) + ': Is a directory</span>');
      return;
    }

    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">nano: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }

    // ❌ Permission denied: узел без edit (чужой пост, readonly-файл)
    if (!node.edit && node.id !== undefined) {
      T.addOutputLine('<span class="tp-err">nano: ' + T._('Нет прав на редактирование', 'Permission denied') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # ' + T._('Можно редактировать только свои посты', 'You can only edit your own posts') + '</span>');
      return;
    }

    // Определяем тип редактора и начальный текст
    var editorType = 'file';
    var editorId = null;
    var initialText = '';
    var apiSaveFn = null;

    // ── Определяем save-функцию по контексту ──
    if (node.id !== undefined && node.text !== undefined) {
      // Пост
      editorType = 'post';
      editorId = node.id;
      initialText = node.text || '';
      apiSaveFn = function(newText) {
        var url = window.EDIT_POST_URL.replace('/0/', '/' + editorId + '/');
        return fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRFToken': T.csrfToken().content,
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: 'text=' + encodeURIComponent(newText)
        });
      };
    } else if (args === 'info' || args === 'profile/info') {
      // Профиль (bio)
      editorType = 'profile';
      initialText = '';
      // Загружаем текущее описание
      T.showLoading(T._('Загрузка профиля...', 'Loading profile...'));
      fetch(window.API_ME_URL, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          T.hideLoading();
          if (!data.ok) throw new Error('not authenticated');
          T.showNanoEditor('profile', null, data.user.description || '', function(newDesc) {
            return fetch(window.EDIT_PROFILE_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': T.csrfToken().content,
                'X-Requested-With': 'XMLHttpRequest'
              },
              body: 'description=' + encodeURIComponent(newDesc)
            });
          });
        })
        .catch(function() {
          T.hideLoading();
          T.addOutputLine('<span class="tp-err">nano: ' + T._('не удалось загрузить профиль', 'could not load profile') + '</span>');
        });
      return;
    }

    if (apiSaveFn) {
      T.showNanoEditor(editorType, editorId, initialText, apiSaveFn);
      return;
    }

    T.addOutputLine('<span class="tp-err">nano: ' + T.escapeHtml(args) + ': ' + T._('нельзя редактировать', 'not editable') + '</span>');
    T.addOutputLine('<span class="tp-desc">  # ' + T._('Редактировать можно посты и описание профиля', 'Editable: posts and profile description') + '</span>');
  };

  // ── Show nano full-screen editor ──
  T.showNanoEditor = function(type, id, initialText, saveFn) {
    if (T.nanoOverlay) return;

    var filename = type === 'profile' ? 'description.txt' : type === 'create' ? 'new.txt' : id + '.txt';
    var modified = false;

    var overlay = document.createElement('div');
    overlay.id = 'nano-overlay';

    var topBar = document.createElement('div');
    topBar.className = 'nano-topbar';
    var topInner = document.createElement('span');
    topInner.className = 'nano-filename';
    topInner.textContent = filename;
    var modSpan = document.createElement('span');
    modSpan.className = 'nano-modified';
    modSpan.textContent = '';
    var statusEl = document.createElement('span');
    statusEl.className = 'nano-status';
    statusEl.textContent = '';
    topBar.appendChild(topInner);
    topBar.appendChild(modSpan);
    topBar.appendChild(statusEl);
    overlay.appendChild(topBar);

    var textarea = document.createElement('textarea');
    textarea.value = initialText || '';
    overlay.appendChild(textarea);

    var bottomBar = document.createElement('div');
    bottomBar.className = 'nano-bottombar';
    bottomBar.id = 'nano-bottom';
    overlay.appendChild(bottomBar);

    function renderShortcuts() {
      bottomBar.innerHTML =
        '<span class="nano-shortcut"><span class="nano-key">^G</span> <span class="nano-label">Help</span></span>' +
        '<span class="nano-shortcut"><span class="nano-key">^O</span> <span class="nano-label">Save</span></span>' +
        '<span class="nano-shortcut"><span class="nano-key">^X</span> <span class="nano-label">Exit</span></span>' +
        '<span class="nano-shortcut"><span class="nano-key">^C</span> <span class="nano-label">Cancel</span></span>';
    }
    renderShortcuts();

    document.body.appendChild(overlay);
    T.nanoOverlay = overlay;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    textarea.addEventListener('input', function() {
      if (!modified && textarea.value !== initialText) {
        modified = true;
        modSpan.textContent = 'Modified';
      }
    });

    function setStatus(msg, cls) {
      statusEl.textContent = msg;
      statusEl.className = 'nano-status' + (cls ? ' ' + cls : '');
    }

    function closeOverlay() {
      if (T.nanoOverlay) {
        T.nanoOverlay.remove();
        T.nanoOverlay = null;
      }
      if (T.el.input) T.el.input.focus();
    }

    function showHelp() {
      var existing = overlay.querySelector('.nano-help');
      if (existing) { existing.remove(); return; }
      var help = document.createElement('div');
      help.className = 'nano-help';
      help.innerHTML =
        '<h3>Nano Help</h3>' +
        '<div class="nano-help-row"><span class="nano-help-key">^O</span> Save changes</div>' +
        '<div class="nano-help-row"><span class="nano-help-key">^X</span> Exit nano (no save)</div>' +
        '<div class="nano-help-row"><span class="nano-help-key">^C</span> Cancel / close</div>' +
        '<div class="nano-help-row"><span class="nano-help-key">^G</span> Toggle this help</div>' +
        '<div class="nano-help-row"><span class="nano-help-key">^S</span> Alternative save</div>' +
        '<br><div class="nano-help-row" style="color:var(--subtle);font-size:0.8rem;">Close this help with ^G or click outside</div>';
      overlay.appendChild(help);
      setTimeout(function() {
        help.addEventListener('click', function(e) { if (e.target === help) help.remove(); });
      }, 0);
    }

    function onKey(e) {
      if ((e.ctrlKey && (e.key === 'o' || e.key === 'O' || e.key === 's' || e.key === 'S')) && !textarea.disabled) {
        e.preventDefault();
        var newText = textarea.value;
        setStatus('saving...', 'saving');
        textarea.disabled = true;

        var result;
        try {
          result = saveFn(newText);
        } catch (e) {
          textarea.disabled = false;
          setStatus('error: invalid input', 'error');
          return;
        }
        if (result && typeof result.then === 'function') {
          result
            .then(function(r) {
              textarea.disabled = false;
              if (r.ok || r.status === 201) {
                setStatus('saved', 'saved');
                initialText = newText;
                modified = false;
                modSpan.textContent = '';
                if (type === 'post') {
                  T.feedData.forEach(function(p) {
                    if (p.id === id) p.text = newText;
                  });
                }
                if (type === 'create') {
                  setTimeout(function() {
                    removeEventListener('keydown', onKey, true);
                    closeOverlay();
                    T.addOutputLine('<span class="tp-ok">' + T._('Пост создан!', 'Post created!') + '</span>');
                  }, 600);
                }
              } else {
                setStatus('error: could not save', 'error');
              }
            })
            .catch(function() {
              textarea.disabled = false;
              setStatus('error: request failed', 'error');
            });
        } else {
          setStatus('saved', 'saved');
          textarea.disabled = false;
        }
        return;
      }

      if (e.ctrlKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        showHelp();
        return;
      }

      if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        if (modified) {
          setStatus('unsaved changes \u2014 use ^O to save or ^C to cancel', 'error');
          return;
        }
        removeEventListener('keydown', onKey, true);
        closeOverlay();
        return;
      }

      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        removeEventListener('keydown', onKey, true);
        closeOverlay();
        return;
      }
    }

    addEventListener('keydown', onKey, true);
    textarea.addEventListener('keydown', function(e) {
      if (e.ctrlKey && (e.key === 'o' || e.key === 'O' || e.key === 's' || e.key === 'S' ||
          e.key === 'x' || e.key === 'X' || e.key === 'c' || e.key === 'C' ||
          e.key === 'g' || e.key === 'G')) {
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
    });
  };

  // ── Registry ──
  T.register('nano', { handler: T.cmdNano, auth: false, category: 'posts', match: 'prefix' });

})(window.TERMINAL);
