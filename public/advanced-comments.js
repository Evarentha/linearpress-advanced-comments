/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/* ============================================================
   Advanced Comments —— 前台字数统计、表情面板 & 后台专辑编辑
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 系统默认 emoji（常见图标） ---------- */
  var SYSTEM_EMOJI = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😉', '😎', '🤗',
    '🤔', '😐', '😏', '😢', '😭', '😡', '😱', '😴', '🤩', '🥳',
    '👍', '👎', '👏', '🙏', '💪', '🤝', '👌', '✌️', '🤞', '❤️',
    '🧡', '💛', '💚', '💙', '💜', '🖤', '💯', '🔥', '✨', '🎉',
    '🎈', '🎁', '⭐', '🌹', '🌸', '☕', '🍰', '🐶', '🐱', '🤖'
  ];

  /* ---------- 字符统计 ---------- */
  function setupCharCounter() {
    var ta = document.getElementById('ac-comment-content');
    if (!ta) return;
    var maxlen = Number(window.__AC_MAXLEN__) || 300;
    var countEl = document.getElementById('ac-char-count');
    function count(v) { return Array.from(String(v)).length; }
    function update() {
      var n = count(ta.value);
      if (countEl) {
        countEl.textContent = n + '/' + maxlen;
        countEl.classList.toggle('over', n > maxlen);
      }
    }
    ta.addEventListener('input', update);
    update();
    var form = ta.closest('form');
    if (form) {
      form.addEventListener('submit', function (e) {
        if (count(ta.value) > maxlen) {
          e.preventDefault();
          ta.setCustomValidity('评论不能超过 ' + maxlen + ' 字（含 Markdown 字符）');
          ta.reportValidity();
        } else {
          ta.setCustomValidity('');
        }
      });
    }
    var btn = document.getElementById('ac-emoji-btn');
    if (window.__AC_EMOJI_ENABLED__ === false && btn) { btn.style.display = 'none'; }
  }

  /* ---------- 后台专辑：动态表情行 ---------- */
  function setupAlbumRows() {
    var wrap = document.getElementById('ac-album-emojis');
    var add = document.getElementById('ac-add-emoji-row');
    if (!wrap || !add) return;
    var idx = wrap.querySelectorAll('.ac-album-row').length + 1;
    add.addEventListener('click', function () {
      var row = document.createElement('div');
      row.className = 'ac-album-row';
      var file = document.createElement('input');
      file.type = 'file'; file.name = 'emoji_' + idx; file.accept = 'image/*'; file.required = true;
      var cap = document.createElement('input');
      cap.type = 'text'; cap.name = 'caption_emoji_' + idx; cap.placeholder = '配文'; cap.required = true;
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'button button-mini danger'; del.textContent = '移除';
      del.addEventListener('click', function () { row.parentNode.removeChild(row); });
      row.appendChild(file); row.appendChild(cap); row.appendChild(del);
      wrap.appendChild(row);
      idx++;
    });
  }

  /* ---------- 表情弹窗 ---------- */
  var PANEL = null;
  var state = { open: false, current: 'emoji', data: null };

  function loadData() {
    if (state.data) return Promise.resolve(state.data);
    var api = window.__AC_EMOJI_API__ || '/api/advanced-comments/emoji';
    return fetch(api).then(function (r) { return r.json(); }).then(function (json) {
      state.data = json.data || { singles: [], texts: [], albums: [] };
      return state.data;
    }).catch(function () { return { singles: [], texts: [], albums: [] }; });
  }

  function buildTabs(data) {
    var tabs = [];
    var sel = data.singles || [];
    if (sel.length) tabs.push({ key: 'single', label: '❤', isImage: false, type: 'single' });
    tabs.push({ key: 'emoji', label: '😀', isImage: false, type: 'emoji' });
    tabs.push({ key: 'text', label: '✧', isImage: false, type: 'text' });
    (data.albums || []).forEach(function (album) {
      tabs.push({ key: 'album:' + album.id, label: album.name, cover: album.cover, isImage: true, type: 'album', albumId: album.id });
    });
    return tabs;
  }

  function itemsFor(data, tab) {
    if (tab.type === 'single') return (data.singles || []).map(function (s) { return { kind: 'image', id: s.id, label: s.name, url: s.url }; });
    if (tab.type === 'emoji') return SYSTEM_EMOJI.map(function (e) { return { kind: 'text', value: e }; });
    if (tab.type === 'text') return (data.texts || []).map(function (t) { return { kind: 'text', value: t.content, label: t.name }; });
    var album = (data.albums || []).filter(function (a) { return a.id === tab.albumId; })[0];
    if (!album) return [];
    return (album.emojis || []).map(function (e) { return { kind: 'image', id: e.id, label: e.name, url: e.url }; });
  }

  function ensurePanel() {
    if (PANEL) return PANEL;
    var backdrop = document.createElement('div');
    backdrop.id = 'ac-emoji-backdrop';
    backdrop.style.display = 'none';
    var panel = document.createElement('div');
    panel.className = 'ac-emoji-panel';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="ac-emoji-top">' +
        '<div class="ac-emoji-topbar"><span>表情</span><button type="button" class="ac-emoji-close" title="关闭">✕</button></div>' +
        '<div class="ac-emoji-tabs"></div>' +
      '</div>' +
      '<div class="ac-emoji-body"><div class="ac-emoji-select"></div></div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    backdrop.addEventListener('click', closePanel);
    panel.querySelector('.ac-emoji-close').addEventListener('click', closePanel);
    // 专辑横滚：桌面滚轮左右滚动，触屏原生横向拖动
    var tabs = panel.querySelector('.ac-emoji-tabs');
    tabs.addEventListener('wheel', function (e) {
      if (e.deltaY !== 0) { e.preventDefault(); tabs.scrollLeft += e.deltaY; }
    }, { passive: false });
    PANEL = { el: panel, tabs: tabs, select: panel.querySelector('.ac-emoji-select') };
    return PANEL;
  }

  function insertValue(ta, value) {
    var start = ta.selectionStart, end = ta.selectionEnd;
    var next = ta.value.slice(0, start) + value + ta.value.slice(end);
    ta.value = next;
    var pos = start + value.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderPanel(btn) {
    loadData().then(function (data) {
      var P = ensurePanel();
      var tabs = buildTabs(data);
      P.tabs.innerHTML = '';
      tabs.forEach(function (tab) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'ac-emoji-tab' + (tab.key === state.current ? ' active' : '');
        if (tab.isImage) { b.innerHTML = '<img class="ac-emoji-cover" src="' + tab.cover + '" alt="">'; }
        var label = document.createElement('span');
        label.textContent = tab.label;
        b.appendChild(label);
        b.addEventListener('click', function () { state.current = tab.key; renderPanel(btn); });
        P.tabs.appendChild(b);
      });
      var active = tabs.filter(function (t) { return t.key === state.current; })[0] || tabs[0];
      if (!active) return;
      state.current = active.key;
      var items = itemsFor(data, active);
      P.select.innerHTML = '';
      items.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'ac-emoji-item';
        b.title = item.label || '';
        if (item.kind === 'image') { var img = document.createElement('img'); img.src = item.url; img.alt = item.label || ''; b.appendChild(img); }
        else { b.textContent = item.value; }
        b.addEventListener('click', function () {
          var ta = document.getElementById('ac-comment-content');
          if (!ta) return;
          if (item.kind === 'image') insertValue(ta, ':emoji:' + item.id);
          else insertValue(ta, item.value);
        });
        P.select.appendChild(b);
      });
    });
  }

  function openPanel(btn) {
    state.open = true;
    var P = ensurePanel();
    document.getElementById('ac-emoji-backdrop').style.display = 'block';
    P.el.style.display = 'flex';
    var rect = btn.getBoundingClientRect();
    var top = Math.min(rect.bottom + 8, window.innerHeight - P.el.offsetHeight - 12);
    var left = Math.min(rect.left, window.innerWidth - 420);
    P.el.style.top = Math.max(8, top) + 'px';
    P.el.style.left = Math.max(8, left) + 'px';
    renderPanel(btn);
  }

  function closePanel() {
    state.open = false;
    if (PANEL) { PANEL.el.style.display = 'none'; }
    var bd = document.getElementById('ac-emoji-backdrop');
    if (bd) bd.style.display = 'none';
  }

  function togglePanel(btn) {
    if (state.open) closePanel();
    else openPanel(btn);
  }

  function setupEmojiButton() {
    var btn = document.getElementById('ac-emoji-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { togglePanel(btn); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  }

  function init() {
    setupCharCounter();
    setupAlbumRows();
    setupEmojiButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
