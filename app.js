'use strict';

/* ------------------------------------------------------------------ *
 * Storage
 * Data shape:
 *   { version: 1,
 *     pains:   [{ id, name, area, createdAt }],
 *     entries: [{ id, painId, ts }],          // ts = epoch ms
 *     areas:   [string] }                     // user-added body areas
 * ------------------------------------------------------------------ */
const STORAGE_KEY = 'paintracker:v1';
const DEFAULT_AREAS = [
  'Head', 'Jaw', 'Neck', 'Shoulder', 'Upper back', 'Lower back', 'Chest', 'Stomach',
  'Arm', 'Elbow', 'Wrist / hand', 'Hip', 'Leg', 'Knee', 'Ankle / foot', 'Other',
];

let state = load();

function emptyState() {
  return { version: 1, pains: [], entries: [], areas: [] };
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
    return emptyState();
  }
}
function normalize(d) {
  const s = emptyState();
  if (!d || typeof d !== 'object') return s;
  s.pains = Array.isArray(d.pains) ? d.pains.filter(p => p && p.id && p.name).map(p => ({
    id: String(p.id), name: String(p.name), area: String(p.area || 'Other'),
    createdAt: Number(p.createdAt) || Date.now(),
  })) : [];
  const ids = new Set(s.pains.map(p => p.id));
  s.entries = Array.isArray(d.entries) ? d.entries.filter(e => e && ids.has(String(e.painId)) && Number(e.ts)).map(e => ({
    id: String(e.id || uid()), painId: String(e.painId), ts: Number(e.ts),
  })) : [];
  s.areas = Array.isArray(d.areas) ? d.areas.map(String) : [];
  return s;
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    showToast('Could not save — storage may be full or blocked.');
  }
}
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}
function allAreas() {
  const used = state.pains.map(p => p.area);
  return [...new Set([...DEFAULT_AREAS, ...state.areas, ...used])];
}

/* ------------------------------------------------------------------ *
 * Actions (each one saves and re-renders)
 * ------------------------------------------------------------------ */
function addPain(name, area) {
  const existing = state.pains.find(p => p.name.toLowerCase() === name.toLowerCase() && p.area === area);
  if (existing) return logEntry(existing.id);
  const pain = { id: uid(), name, area, createdAt: Date.now() };
  state.pains.push(pain);
  const entry = { id: uid(), painId: pain.id, ts: Date.now() };
  state.entries.push(entry);
  save(); render();
  flash(pain.id);
  showToast(`Added “${name}”`, () => {
    state.pains = state.pains.filter(p => p.id !== pain.id);
    state.entries = state.entries.filter(e => e.painId !== pain.id);
    save(); render();
  });
}
function logEntry(painId, ts = Date.now()) {
  const pain = getPain(painId);
  if (!pain) return;
  const entry = { id: uid(), painId, ts };
  state.entries.push(entry);
  save(); render();
  flash(painId);
  if (navigator.vibrate) navigator.vibrate(15);
  showToast(`Logged “${pain.name}” · ${countFor(painId)} total`, () => {
    state.entries = state.entries.filter(e => e.id !== entry.id);
    save(); render();
  });
}
function deleteEntry(entryId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return;
  state.entries = state.entries.filter(e => e.id !== entryId);
  save(); render();
  showToast('Entry deleted', () => { state.entries.push(entry); save(); render(); });
}
function updatePain(painId, name, area) {
  const pain = getPain(painId);
  if (!pain) return;
  const before = { ...pain };
  pain.name = name; pain.area = area;
  save(); render();
  showToast('Changes saved', () => { Object.assign(pain, before); save(); render(); });
}
function deletePain(painId) {
  const pain = getPain(painId);
  if (!pain) return;
  const entries = state.entries.filter(e => e.painId === painId);
  state.pains = state.pains.filter(p => p.id !== painId);
  state.entries = state.entries.filter(e => e.painId !== painId);
  save(); render();
  showToast(`Deleted “${pain.name}”`, () => {
    state.pains.push(pain); state.entries.push(...entries); save(); render();
  });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const $ = sel => document.querySelector(sel);
const getPain = id => state.pains.find(p => p.id === id);
const entriesFor = id => state.entries.filter(e => !id || e.painId === id);
const countFor = id => state.entries.reduce((n, e) => n + (e.painId === id ? 1 : 0), 0);
const lastFor = id => state.entries.reduce((m, e) => (e.painId === id && e.ts > m ? e.ts : m), 0);
const DAY = 86400000;

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}
function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(o => {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    return el('option', { value: v, selected: v === value }, label);
  }));
  if (value != null) select.value = value;
}
function relTime(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(diff / DAY);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}
const fmtDateTime = ts => new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function startOfWeek(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}
function startOfMonth(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(1); return x; }

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */
let currentView = 'pains';
let histRange = 'week';
let openPainId = null;

function render() {
  renderAreaSelects();
  renderPainList();
  if (currentView === 'history') renderHistory();
  if (currentView === 'data') renderData();
  if (openPainId) renderDetail();
}

function renderAreaSelects() {
  const areas = allAreas();
  fillSelect($('#add-area'), [['', 'Body area…'], ...areas], $('#add-area').value);
  const used = [...new Set(state.pains.map(p => p.area))].sort();
  const filterVal = $('#area-filter').value || 'all';
  fillSelect($('#area-filter'), [['all', 'All areas'], ...used], used.includes(filterVal) ? filterVal : 'all');
}

function renderPainList() {
  const filter = $('#area-filter').value;
  const sort = $('#sort-by').value;
  let pains = state.pains.filter(p => filter === 'all' || !filter || p.area === filter);
  const stats = new Map(pains.map(p => [p.id, { n: countFor(p.id), last: lastFor(p.id) }]));
  pains.sort((a, b) => {
    if (sort === 'count') return stats.get(b.id).n - stats.get(a.id).n || a.name.localeCompare(b.name);
    if (sort === 'name') return a.name.localeCompare(b.name);
    return (stats.get(b.id).last || b.createdAt) - (stats.get(a.id).last || a.createdAt);
  });
  $('#pain-list').replaceChildren(...pains.map(p => {
    const s = stats.get(p.id);
    return el('li', { class: 'pain-item', 'data-id': p.id },
      el('button', {
        class: 'pain-main', type: 'button',
        'aria-label': `Log ${p.name}. ${s.n} so far, last ${relTime(s.last)}`,
        onclick: () => logEntry(p.id),
      },
        el('span', { class: 'count', 'aria-hidden': 'true' }, String(s.n)),
        el('span', { class: 'pain-text' },
          el('span', { class: 'pain-name' }, p.name),
          el('span', { class: 'pain-meta' }, el('span', { class: 'area-tag' }, p.area), `Last: ${relTime(s.last)}`),
        ),
      ),
      el('button', { class: 'pain-more', type: 'button', 'aria-label': `Details for ${p.name}`, onclick: () => openDetail(p.id) }, '⋯'),
    );
  }));
  $('#empty-pains').hidden = state.pains.length > 0;
}

function flash(painId) {
  const btn = document.querySelector(`.pain-item[data-id="${CSS.escape(painId)}"] .pain-main`);
  if (!btn) return;
  btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
}

/* ---- Buckets for charts ---- */
function buckets(entries, range, n) {
  const now = new Date();
  const out = [];
  let start = range === 'week' ? startOfWeek(now) : startOfMonth(now);
  for (let i = 0; i < n; i++) {
    const end = new Date(start);
    if (range === 'week') end.setDate(end.getDate() + 7); else end.setMonth(end.getMonth() + 1);
    out.unshift({ start: new Date(start), end, count: 0 });
    if (range === 'week') start.setDate(start.getDate() - 7); else start.setMonth(start.getMonth() - 1);
  }
  const first = out[0].start.getTime();
  for (const e of entries) {
    if (e.ts < first) continue;
    const b = out.find(b => e.ts >= b.start.getTime() && e.ts < b.end.getTime());
    if (b) b.count++;
  }
  for (const b of out) {
    if (range === 'week') {
      const last = new Date(b.end.getTime() - DAY);
      const f = { month: 'short', day: 'numeric' };
      b.short = b.start.toLocaleDateString(undefined, f);
      b.long = `Week of ${b.start.toLocaleDateString(undefined, f)} – ${last.toLocaleDateString(undefined, f)}`;
    } else {
      b.short = b.start.toLocaleDateString(undefined, { month: 'short' });
      b.long = b.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
  }
  return out;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function niceMax(v) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return v;
}

/** Single-series bar chart with per-bar hover/tap tooltip. */
function barChart(container, data, { unit = 'time' } = {}) {
  const W = 340, H = 170, padL = 26, padR = 4, padT = 8, padB = 22;
  const max = niceMax(Math.max(...data.map(d => d.count), 1));
  const iw = W - padL - padR, ih = H - padT - padB;
  const step = iw / data.length;
  const bw = Math.max(4, Math.min(28, step - 4)); // keep a gap between bars
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Bar chart of instances per ${unit}` });

  const ticks = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max];
  for (const t of ticks) {
    const y = padT + ih - (t / max) * ih;
    root.append(svg('line', { class: 'grid', x1: padL, x2: W - padR, y1: y, y2: y }));
    const lbl = svg('text', { class: 'axis-label', x: padL - 6, y: y + 4, 'text-anchor': 'end' });
    lbl.textContent = Number.isInteger(t) ? t : t.toFixed(1);
    root.append(lbl);
  }

  const labelEvery = Math.ceil(data.length / 6);
  data.forEach((d, i) => {
    const cx = padL + step * i + step / 2;
    const h = (d.count / max) * ih;
    const x = cx - bw / 2, yBase = padT + ih;
    const g = svg('g');
    const hit = svg('rect', { class: 'hit', x: padL + step * i, y: padT, width: step, height: ih + padB, tabindex: 0 });
    const tip = `${d.long}: ${d.count} ${d.count === 1 ? 'instance' : 'instances'}`;
    hit.setAttribute('aria-label', tip);
    g.append(hit);
    if (d.count > 0) {
      const r = Math.min(4, bw / 2, h);
      // Bar with rounded top corners, square at baseline
      const path = `M${x},${yBase} V${yBase - h + r} Q${x},${yBase - h} ${x + r},${yBase - h} H${x + bw - r} Q${x + bw},${yBase - h} ${x + bw},${yBase - h + r} V${yBase} Z`;
      g.append(svg('path', { class: 'bar', d: path }));
    }
    if (i % labelEvery === (data.length - 1) % labelEvery) {
      const t = svg('text', { class: 'axis-label', x: cx, y: H - 6, 'text-anchor': 'middle' });
      t.textContent = d.short;
      g.append(t);
    }
    const show = () => {
      const r = hit.getBoundingClientRect();
      const top = root.getBoundingClientRect().top + ((yBase - h) / H) * root.getBoundingClientRect().height;
      showTip(tip, r.left + r.width / 2, Math.max(top, 8));
      g.querySelector('.bar')?.classList.add('active');
    };
    const hide = () => { hideTip(); g.querySelector('.bar')?.classList.remove('active'); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    root.append(g);
  });
  container.replaceChildren(root);
}
function showTip(text, x, y) {
  const t = $('#tooltip');
  t.textContent = text; t.hidden = false;
  const half = t.offsetWidth / 2 + 8;
  t.style.left = `${Math.min(Math.max(x, half), window.innerWidth - half)}px`;
  t.style.top = `${y}px`;
}
function hideTip() { $('#tooltip').hidden = true; }
document.addEventListener('scroll', hideTip, { passive: true });

function statsRow(container, entries) {
  const now = Date.now();
  const last7 = entries.filter(e => e.ts > now - 7 * DAY).length;
  const last30 = entries.filter(e => e.ts > now - 30 * DAY).length;
  const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'v' }, String(v)), el('div', { class: 'l' }, l));
  container.replaceChildren(stat(entries.length, 'Total'), stat(last7, 'Last 7 days'), stat(last30, 'Last 30 days'));
}

function entryRow(e, showName) {
  const pain = getPain(e.painId);
  return el('li', {},
    el('div', {},
      el('div', { class: 'when' }, fmtDateTime(e.ts)),
      showName ? el('div', { class: 'sub' }, `${pain.name} · ${pain.area}`) : null,
    ),
    el('button', { class: 'del', type: 'button', 'aria-label': `Delete entry from ${fmtDateTime(e.ts)}`, onclick: () => deleteEntry(e.id) }, '✕'),
  );
}

function renderHistory() {
  const sel = $('#hist-pain');
  const prev = sel.value || 'all';
  const pains = [...state.pains].sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(sel, [['all', 'All pains'], ...pains.map(p => [p.id, `${p.name} (${p.area})`])],
    prev === 'all' || getPain(prev) ? prev : 'all');
  const id = sel.value === 'all' ? null : sel.value;
  const entries = entriesFor(id);
  statsRow($('#hist-stats'), entries);
  const data = buckets(entries, histRange, 12);
  barChart($('#hist-chart'), data, { unit: histRange });
  $('#hist-table').replaceChildren(el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, histRange === 'week' ? 'Week' : 'Month'), el('th', {}, 'Count'))),
    el('tbody', {}, [...data].reverse().map(d => el('tr', {}, el('td', {}, d.long), el('td', { class: 'n' }, String(d.count))))),
  ));
  const recent = [...entries].sort((a, b) => b.ts - a.ts).slice(0, 50);
  $('#hist-entries').replaceChildren(...recent.map(e => entryRow(e, !id)));
  $('#empty-hist').hidden = entries.length > 0;
}

function renderData() {
  $('#custom-areas').replaceChildren(...state.areas.map(a => el('li', {}, a,
    el('button', { type: 'button', 'aria-label': `Remove ${a}`, onclick: () => {
      state.areas = state.areas.filter(x => x !== a); save(); render();
    } }, '✕'))));
}

/* ---- Detail sheet ---- */
function openDetail(painId) {
  openPainId = painId;
  const pain = getPain(painId);
  $('#edit-name').value = pain.name;
  fillSelect($('#edit-area'), allAreas(), pain.area);
  $('#backdate-form').hidden = true;
  $('.edit-box').open = false;
  renderDetail();
  $('#detail').showModal();
}
function renderDetail() {
  const pain = getPain(openPainId);
  if (!pain) { closeDetail(); return; }
  $('#detail-title').textContent = pain.name;
  const entries = entriesFor(pain.id).sort((a, b) => b.ts - a.ts);
  statsRow($('#detail-stats'), entries);
  barChart($('#detail-chart'), buckets(entries, 'week', 12), { unit: 'week' });
  $('#detail-entries').replaceChildren(...entries.map(e => entryRow(e, false)));
}
function closeDetail() {
  openPainId = null;
  hideTip();
  if ($('#detail').open) $('#detail').close();
}

/* ---- Toast with undo ---- */
let toastTimer = null;
let undoFn = null;
function showToast(msg, undo) {
  $('#toast-msg').textContent = msg;
  undoFn = undo || null;
  $('#toast-undo').hidden = !undo;
  $('#toast').hidden = false;
  // Keep the toast visible above an open modal dialog
  const host = $('#detail').open ? $('#detail') : document.body;
  if ($('#toast').parentElement !== host) host.append($('#toast'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoFn = null; }, 6000);
}

/* ------------------------------------------------------------------ *
 * Export / import
 * ------------------------------------------------------------------ */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // avoid spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv() {
  if (!state.entries.length) { showToast('Nothing to export yet.'); return; }
  const pad = n => String(n).padStart(2, '0');
  const rows = [['Pain', 'Body area', 'Date', 'Time', 'Timestamp (ISO)']];
  for (const e of [...state.entries].sort((a, b) => a.ts - b.ts)) {
    const p = getPain(e.painId); const d = new Date(e.ts);
    rows.push([p.name, p.area, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      `${pad(d.getHours())}:${pad(d.getMinutes())}`, d.toISOString()]);
  }
  download(`pain-tracker-${stamp()}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function exportJson() {
  download(`pain-tracker-backup-${stamp()}.json`, JSON.stringify(state, null, 2), 'application/json');
}
async function importJson(file) {
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!data.pains.length) throw new Error('empty');
    const msg = `Restore ${data.pains.length} pains and ${data.entries.length} entries? This replaces the data in this browser.`;
    if (!confirm(msg)) return;
    const before = state;
    state = data; save(); render();
    showToast('Backup restored', () => { state = before; save(); render(); });
  } catch {
    showToast('That file is not a valid Pain Tracker backup.');
  }
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */
function switchView(view) {
  currentView = view;
  for (const btn of document.querySelectorAll('.tabs button')) btn.setAttribute('aria-selected', btn.dataset.view === view);
  for (const sec of document.querySelectorAll('.view')) sec.hidden = sec.id !== `view-${view}`;
  hideTip();
  render();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

$('#add-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#add-name').value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  addPain(name, $('#add-area').value || 'Other');
  $('#add-name').value = '';
  $('#add-area').value = '';
  $('#add-name').blur();
});
$('#area-filter').addEventListener('change', renderPainList);
$('#sort-by').addEventListener('change', renderPainList);

$('#hist-pain').addEventListener('change', renderHistory);
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  histRange = b.dataset.range;
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  renderHistory();
}));
$('#hist-table-toggle').addEventListener('click', () => {
  const t = $('#hist-table'); t.hidden = !t.hidden;
  $('#hist-table-toggle').textContent = t.hidden ? 'Show as table' : 'Hide table';
});

$('#detail-close').addEventListener('click', closeDetail);
$('#detail').addEventListener('close', () => { openPainId = null; hideTip(); document.body.append($('#toast')); });
$('#detail').addEventListener('click', e => { if (e.target === $('#detail')) closeDetail(); });
$('#detail-log').addEventListener('click', () => logEntry(openPainId));
$('#detail-backdate-toggle').addEventListener('click', () => {
  const f = $('#backdate-form'); f.hidden = !f.hidden;
  if (!f.hidden) {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    $('#backdate').value = d.toISOString().slice(0, 16);
    $('#backdate').max = $('#backdate').value;
    $('#backdate').focus();
  }
});
$('#backdate-form').addEventListener('submit', e => {
  e.preventDefault();
  const ts = new Date($('#backdate').value).getTime();
  if (!ts) return;
  logEntry(openPainId, Math.min(ts, Date.now()));
  $('#backdate-form').hidden = true;
});
$('#edit-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#edit-name').value.trim().replace(/\s+/g, ' ');
  if (name) updatePain(openPainId, name, $('#edit-area').value);
});
$('#delete-pain').addEventListener('click', () => {
  const pain = getPain(openPainId);
  if (pain && confirm(`Delete “${pain.name}” and all ${countFor(pain.id)} of its entries?`)) {
    const id = pain.id; closeDetail(); deletePain(id);
  }
});

$('#toast-undo').addEventListener('click', () => {
  const fn = undoFn; undoFn = null;
  $('#toast').hidden = true;
  if (fn) fn();
});

$('#export-csv').addEventListener('click', exportCsv);
$('#export-json').addEventListener('click', exportJson);
$('#import-json').addEventListener('change', e => {
  const f = e.target.files[0]; if (f) importJson(f); e.target.value = '';
});
$('#area-form').addEventListener('submit', e => {
  e.preventDefault();
  const a = $('#new-area').value.trim();
  if (a && !allAreas().some(x => x.toLowerCase() === a.toLowerCase())) { state.areas.push(a); save(); render(); }
  $('#new-area').value = '';
});
$('#wipe').addEventListener('click', () => {
  if (!confirm('Delete ALL pains and entries from this browser? Consider saving a backup first.')) return;
  const before = state;
  state = emptyState(); save(); render();
  showToast('All data deleted', () => { state = before; save(); render(); });
});

// Keep "x min ago" labels fresh
setInterval(() => { if (currentView === 'pains' && !document.hidden) renderPainList(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
