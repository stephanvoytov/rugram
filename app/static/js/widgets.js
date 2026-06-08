/**
 * Widgets management — add, remove, update profile widgets from /edit_profile.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────

  var widgets = [];
  var configSchemas = {};
  var pendingConfig = null; // { type, config } while modal is open

  var listEl = document.getElementById('widgets-list');
  var emptyEl = document.getElementById('widgets-empty');
  var typeSelect = document.getElementById('widget-type-select');
  var addBtn = document.getElementById('widget-add-btn');
  var modal = document.getElementById('widget-config-modal');
  var configFields = document.getElementById('widget-config-fields');
  var configSave = document.getElementById('widget-config-save');
  var configCancel = document.getElementById('widget-config-cancel');

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    if (!listEl) return; // not on edit_profile page
    fetch('/api/v1/profile/widgets/schema')
      .then(function (r) { return r.json(); })
      .then(function (s) { configSchemas = s; })
      .catch(function () {});
    loadWidgets();
  }

  // ── Load ──────────────────────────────────────────────────────────

  function loadWidgets() {
    fetch('/api/v1/profile/widgets')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        widgets = data;
        render();
      })
      .catch(function () {});
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    var enabled = widgets.filter(function (w) { return w.enabled; });
    if (enabled.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state" style="padding:20px;text-align:center;color:var(--subtle)">no widgets yet</div>';
      return;
    }

    var html = '';
    enabled.forEach(function (w) {
      var label = w.type.charAt(0).toUpperCase() + w.type.slice(1);
      var configStr = formatConfig(w);
      html +=
        '<div class="widget-item" data-id="' + w.id + '" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--overlay);margin-bottom:4px">' +
          '<span style="cursor:grab;color:var(--subtle)">≡</span>' +
          '<span style="font-weight:700;min-width:70px">' + label + '</span>' +
          '<span style="flex:1;color:var(--subtext);font-size:0.8rem">' + configStr + '</span>' +
          '<button class="widget-edit-btn" data-id="' + w.id + '" style="background:none;border:none;color:var(--yellow);cursor:pointer;font-size:0.8rem">[edit]</button>' +
          '<button class="widget-del-btn" data-id="' + w.id + '" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.8rem">[✕]</button>' +
        '</div>';
    });
    listEl.innerHTML = html;

    // Bind events
    listEl.querySelectorAll('.widget-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteWidget(parseInt(this.dataset.id)); });
    });
    listEl.querySelectorAll('.widget-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openEdit(parseInt(this.dataset.id)); });
    });
  }

  function formatConfig(w) {
    if (!w.config) return '';
    var parts = [];
    if (w.config.username) parts.push(w.config.username);
    if (w.config.city) parts.push(w.config.city);
    if (w.config.steam_id) parts.push(w.config.steam_id.substring(0, 10) + '…');
    return parts.join(', ') || '—';
  }

  // ── Add ───────────────────────────────────────────────────────────

  addBtn.addEventListener('click', function () {
    var type = typeSelect.value;
    pendingConfig = { type: type, config: {} };
    showConfigModal(type, {}, function (cfg) {
      fetch('/api/v1/profile/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRF() },
        body: JSON.stringify({ type: type, config: cfg }),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error(d.error); });
          return r.json();
        })
        .then(function () {
          hideModal();
          loadWidgets();
        })
        .catch(function (e) { alert(e.message); });
    });
  });

  // ── Edit ──────────────────────────────────────────────────────────

  function openEdit(id) {
    var w = widgets.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    pendingConfig = { type: w.type, config: w.config, id: w.id };
    showConfigModal(w.type, w.config, function (cfg) {
      fetch('/api/v1/profile/widgets/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRF() },
        body: JSON.stringify({ config: cfg }),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error(d.error); });
          loadWidgets();
          hideModal();
        })
        .catch(function (e) { alert(e.message); });
    });
  }

  // ── Delete ────────────────────────────────────────────────────────

  function deleteWidget(id) {
    fetch('/api/v1/profile/widgets/' + id, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCSRF() },
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error); });
        loadWidgets();
      })
      .catch(function (e) { alert(e.message); });
  }

  // ── Config modal ──────────────────────────────────────────────────

  function showConfigModal(type, currentConfig, onSave) {
    var schema = configSchemas[type] || [];
    var html = '';
    schema.forEach(function (field) {
      var val = currentConfig[field.key] || '';
      html +=
        '<div class="auth-field" style="margin-bottom:8px">' +
          '<label class="field-label">' + field.label + '</label>' +
          '<input type="text" class="field-input widget-cfg-input" data-key="' + field.key + '" value="' + esc(val) + '" placeholder="' + esc(field.placeholder || '') + '" style="padding:6px;font-size:0.8rem;width:100%">' +
        '</div>';
    });
    configFields.innerHTML = html;
    modal.style.display = 'block';

    configSave.onclick = function () {
      var cfg = {};
      modal.querySelectorAll('.widget-cfg-input').forEach(function (inp) {
        cfg[inp.dataset.key] = inp.value.trim();
      });
      onSave(cfg);
    };
    configCancel.onclick = hideModal;
  }

  function hideModal() {
    modal.style.display = 'none';
    configFields.innerHTML = '';
    pendingConfig = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function getCSRF() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
