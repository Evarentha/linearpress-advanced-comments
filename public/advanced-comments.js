/*
 * Advanced Comments Front End
 *
 * Character counter and emoji picker for the comment form; settings page toggles.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(() => {
  /* ---------- settings page: show rate fields only when enabled ---------- */
  document.querySelectorAll('[data-ac-toggle]').forEach((box) => {
    const target = document.querySelector(`[data-ac-when="${box.dataset.acToggle}"]`);
    const sync = () => { if (target) target.hidden = !box.checked; };
    box.addEventListener('change', sync); sync();
  });

  const toolbar = document.querySelector('[data-lp-plugin="advanced-comments"].ac-toolbar');
  const form = toolbar?.closest('form');
  const textarea = form?.querySelector('textarea[name="content"]');
  if (!toolbar || !textarea) return;
  const LP = window.LinearPress;
  const chars = (value) => Array.from(String(value)).length;

  /* ---------- counter ---------- */
  const counter = toolbar.querySelector('[data-ac-count]');
  const max = Number(counter?.dataset.max) || 500;
  const update = () => {
    const n = chars(textarea.value.trim());
    counter.textContent = `${n} / ${max}`;
    counter.classList.toggle('is-over', n > max);
    textarea.setCustomValidity(n > max ? `评论最多 ${max} 字，现在有 ${n} 字` : '');
  };
  textarea.addEventListener('input', update);
  update();

  /* ---------- emoji picker ---------- */
  const button = toolbar.querySelector('[data-ac-emoji]');
  if (!button) return;
  const SYSTEM = '😀 😁 😂 🤣 😊 😍 😘 😉 😎 🤗 🤔 😐 😏 😢 😭 😡 😱 😴 🤩 🥳 👍 👎 👏 🙏 💪 🤝 👌 ✌️ 🤞 ❤️ 💯 🔥 ✨ 🎉 🌹 ☕ 🍰 🐶 🐱 🤖'.split(' ');
  let data = null;
  let panel = null;
  let current = 'system';
  const insert = (value) => {
    const { selectionStart: start, selectionEnd: end } = textarea;
    textarea.setRangeText(value, start, end, 'end');
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const close = () => { if (!panel) return; panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  function tabs() {
    const list = [{ key: 'system', label: '😀', title: '常用' }];
    if (data.singles.length) list.push({ key: 'single', label: '❤', title: '表情' });
    if (data.texts.length) list.push({ key: 'text', label: '(｡･ω･｡)', title: '颜文字' });
    for (const album of data.albums) list.push({ key: `album:${album.id}`, label: album.name, cover: album.cover, title: album.description || album.name });
    return list;
  }
  function items(key) {
    if (key === 'system') return SYSTEM.map((value) => ({ text: value, insert: value }));
    if (key === 'single') return data.singles.map((item) => ({ image: item.url, label: item.name, insert: `:emoji:${item.id}` }));
    if (key === 'text') return data.texts.map((item) => ({ text: item.content, label: item.name, insert: item.content, wide: true }));
    const album = data.albums.find((a) => `album:${a.id}` === key);
    return (album?.emojis ?? []).map((item) => ({ image: item.url, label: item.name, insert: `:emoji:${item.id}` }));
  }
  function render() {
    const tabList = tabs();
    if (!tabList.some((tab) => tab.key === current)) current = 'system';
    panel.querySelector('.ac-tabs').replaceChildren(...tabList.map((tab) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ac-tab'; b.title = tab.title; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(tab.key === current));
      if (tab.cover) { const img = document.createElement('img'); img.src = tab.cover; img.alt = ''; b.append(img); }
      b.append(tab.label);
      b.addEventListener('click', () => { current = tab.key; render(); });
      return b;
    }));
    panel.querySelector('.ac-items').replaceChildren(...items(current).map((item) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `ac-item${item.wide ? ' is-wide' : ''}`; b.title = item.label || item.text || '';
      if (item.image) { const img = document.createElement('img'); img.src = item.image; img.alt = item.label || ''; img.loading = 'lazy'; b.append(img); }
      else b.textContent = item.text;
      b.addEventListener('click', () => insert(item.insert));
      return b;
    }));
  }
  async function open() {
    if (!data) {
      try { data = (await (await fetch('/api/advanced-comments/emoji', { headers: { accept: 'application/json' } })).json()).data; }
      catch { data = { singles: [], texts: [], albums: [] }; LP?.toast('自定义表情加载失败，先用常用表情吧', 'danger'); }
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'ac-panel';
      panel.dataset.lpPlugin = 'advanced-comments';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', '选择表情');
      panel.innerHTML = '<div class="ac-tabs" role="tablist"></div><div class="ac-items"></div>';
      toolbar.append(panel);
      document.addEventListener('click', (event) => { if (!panel.hidden && !panel.contains(event.target) && event.target !== button) close(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { close(); button.focus(); } });
    }
    render();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => (panel && !panel.hidden ? close() : open()));
})();
