/*
 * Advanced Comments Client Script
 *
 * Front-end comment form behavior plus admin emoji album editing helpers.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Front end: live character counting with submit-time length validation, and
 * a tabbed emoji picker panel (system emoji, custom singles, kaomoji,
 * albums) that lazily fetches the emoji library from the plugin's JSON API
 * and inserts tokens at the caret. Admin: dynamically adds captioned upload
 * rows when building emoji albums.
 * @since 1.0.0
 */

(() => {

  /* ---------- 系统默认 emoji（常见图标） ---------- */
  let SYSTEM_EMOJI = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😉', '😎', '🤗',
    '🤔', '😐', '😏', '😢', '😭', '😡', '😱', '😴', '🤩', '🥳',
    '👍', '👎', '👏', '🙏', '💪', '🤝', '👌', '✌️', '🤞', '❤️',
    '🧡', '💛', '💚', '💙', '💜', '🖤', '💯', '🔥', '✨', '🎉',
    '🎈', '🎁', '⭐', '🌹', '🌸', '☕', '🍰', '🐶', '🐱', '🤖'
  ];

  /* ---------- 字符统计 ---------- */
  function setupCharCounter() {
    let ta = document.getElementById('ac-comment-content');
    if (!ta) return;
    let maxlen = Number(window.__AC_MAXLEN__) || 300;
    let countEl = document.getElementById('ac-char-count');
    function count(v) { return Array.from(String(v)).length; }
    function update() {
      let n = count(ta.value);
      if (countEl) {
        countEl.textContent = n + '/' + maxlen;
        countEl.classList.toggle('over', n > maxlen);
      }
    }
    ta.addEventListener('input', update);
    update();
    let form = ta.closest('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        if (count(ta.value) > maxlen) {
          e.preventDefault();
          ta.setCustomValidity('评论不能超过 ' + maxlen + ' 字（含 Markdown 字符）');
          ta.reportValidity();
        } else {
          ta.setCustomValidity('');
        }
      });
    }
    let btn = document.getElementById('ac-emoji-btn');
    if (window.__AC_EMOJI_ENABLED__ === false && btn) { btn.style.display = 'none'; }
  }

  /* ---------- 后台专辑：动态表情行 ---------- */
  function setupAlbumRows() {
    let wrap = document.getElementById('ac-album-emojis');
    let add = document.getElementById('ac-add-emoji-row');
    if (!wrap || !add) return;
    let idx = wrap.querySelectorAll('.ac-album-row').length + 1;
    add.addEventListener('click', () => {
      let row = document.createElement('div');
      row.className = 'ac-album-row';
      let file = document.createElement('input');
      file.type = 'file'; file.name = 'emoji_' + idx; file.accept = 'image/*'; file.required = true;
      let cap = document.createElement('input');
      cap.type = 'text'; cap.name = 'caption_emoji_' + idx; cap.placeholder = '配文'; cap.required = true;
      let del = document.createElement('button');
      del.type = 'button'; del.className = 'button button-mini danger'; del.textContent = '移除';
      del.addEventListener('click', () => { row.parentNode.removeChild(row); });
      row.appendChild(file); row.appendChild(cap); row.appendChild(del);
      wrap.appendChild(row);
      idx++;
    });
  }

  /* ---------- 表情弹窗 ---------- */
  let PANEL = null;
  let state = { open: false, current: 'emoji', data: null };

  function loadData() {
    if (state.data) return Promise.resolve(state.data);
    let api = window.__AC_EMOJI_API__ || '/api/advanced-comments/emoji';
    return fetch(api).then((r) => { return r.json(); }).then((json) => {
      state.data = json.data || { singles: [], texts: [], albums: [] };
      return state.data;
    }).catch(() => { return { singles: [], texts: [], albums: [] }; });
  }

  function buildTabs(data) {
    let tabs = [];
    let sel = data.singles || [];
    if (sel.length) tabs.push({ key: 'single', label: '❤', isImage: false, type: 'single' });
    tabs.push({ key: 'emoji', label: '😀', isImage: false, type: 'emoji' });
    tabs.push({ key: 'text', label: '✧', isImage: false, type: 'text' });
    (data.albums || []).forEach((album) => {
      tabs.push({ key: 'album:' + album.id, label: album.name, cover: album.cover, isImage: true, type: 'album', albumId: album.id });
    });
    return tabs;
  }

  function itemsFor(data, tab) {
    if (tab.type === 'single') return (data.singles || []).map((s) => { return { kind: 'image', id: s.id, label: s.name, url: s.url }; });
    if (tab.type === 'emoji') return SYSTEM_EMOJI.map((e) => { return { kind: 'text', value: e }; });
    if (tab.type === 'text') return (data.texts || []).map((t) => { return { kind: 'text', value: t.content, label: t.name }; });
    let album = (data.albums || []).filter((a) => { return a.id === tab.albumId; })[0];
    if (!album) return [];
    return (album.emojis || []).map((e) => { return { kind: 'image', id: e.id, label: e.name, url: e.url }; });
  }

  function ensurePanel() {
    if (PANEL) return PANEL;
    let backdrop = document.createElement('div');
    backdrop.id = 'ac-emoji-backdrop';
    backdrop.style.display = 'none';
    let panel = document.createElement('div');
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
    let tabs = panel.querySelector('.ac-emoji-tabs');
    tabs.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) { e.preventDefault(); tabs.scrollLeft += e.deltaY; }
    }, { passive: false });
    PANEL = { el: panel, tabs: tabs, select: panel.querySelector('.ac-emoji-select') };
    return PANEL;
  }

  function insertValue(ta, value) {
    let start = ta.selectionStart, end = ta.selectionEnd;
    let next = ta.value.slice(0, start) + value + ta.value.slice(end);
    ta.value = next;
    let pos = start + value.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderPanel(btn) {
    loadData().then((data) => {
      let P = ensurePanel();
      let tabs = buildTabs(data);
      P.tabs.innerHTML = '';
      tabs.forEach((tab) => {
        let b = document.createElement('button');
        b.type = 'button'; b.className = 'ac-emoji-tab' + (tab.key === state.current ? ' active' : '');
        if (tab.isImage) { let coverImg = document.createElement('img'); coverImg.className = 'ac-emoji-cover'; coverImg.src = tab.cover; coverImg.alt = ''; b.appendChild(coverImg); }
        let label = document.createElement('span');
        label.textContent = tab.label;
        b.appendChild(label);
        b.addEventListener('click', () => { state.current = tab.key; renderPanel(btn); });
        P.tabs.appendChild(b);
      });
      let active = tabs.filter((t) => { return t.key === state.current; })[0] || tabs[0];
      if (!active) return;
      state.current = active.key;
      let items = itemsFor(data, active);
      P.select.innerHTML = '';
      items.forEach((item) => {
        let b = document.createElement('button');
        b.type = 'button'; b.className = 'ac-emoji-item';
        b.title = item.label || '';
        if (item.kind === 'image') { let img = document.createElement('img'); img.src = item.url; img.alt = item.label || ''; b.appendChild(img); }
        else { b.textContent = item.value; }
        b.addEventListener('click', () => {
          let ta = document.getElementById('ac-comment-content');
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
    let P = ensurePanel();
    document.getElementById('ac-emoji-backdrop').style.display = 'block';
    P.el.style.display = 'flex';
    let rect = btn.getBoundingClientRect();
    let top = Math.min(rect.bottom + 8, window.innerHeight - P.el.offsetHeight - 12);
    let left = Math.min(rect.left, window.innerWidth - 420);
    P.el.style.top = Math.max(8, top) + 'px';
    P.el.style.left = Math.max(8, left) + 'px';
    renderPanel(btn);
  }

  function closePanel() {
    state.open = false;
    if (PANEL) { PANEL.el.style.display = 'none'; }
    let bd = document.getElementById('ac-emoji-backdrop');
    if (bd) bd.style.display = 'none';
  }

  function togglePanel(btn) {
    if (state.open) closePanel();
    else openPanel(btn);
  }

  function setupEmojiButton() {
    let btn = document.getElementById('ac-emoji-btn');
    if (!btn) return;
    btn.addEventListener('click', () => { togglePanel(btn); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
  }

  function init() {
    setupCharCounter();
    setupAlbumRows();
    setupEmojiButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
