// خريطة الأعضاء المشاركين لمواقعهم + طلبات المساعدة ذات الموقع
import { h, mount, icon, topbar, fmtRelative, HELP_KIND, toast, fitToViewport } from '../ui.js';
import { state, must, on, member, myId, isDegraded, watchChannel } from '../core.js';
import { signedUrl, initials } from '../media.js';
import { makeMap, mapFallback, FRESH_MS, STALE_MS, pinIcon } from '../geo.js';
import { sharingCard } from '../share-ui.js';

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export default async function mapPage(root) {
  const mapEl = h('div', { class: 'map' });
  const countChip = h('span', { class: 'chip' }, '…');
  const card = sharingCard();
  const sheet = h('div', { class: 'map-sheet stack', style: { gap: '10px' } },
    h('div', { class: 'row between' }, h('div', { class: 'small muted' }, 'الأعضاء الظاهرون على الخريطة'), countChip),
    card);
  const pageEl = h('div', { class: 'map-page' }, mapEl, sheet);
  mount(root, topbar({ title: 'الخريطة', actions: h('a', { class: 'btn sm', href: '#/places' }, icon('wrench'), 'المحلات') }), pageEl);
  const unfit = fitToViewport(pageEl);

  let L, map;
  try { ({ L, map } = await makeMap(mapEl)); }
  catch { mapFallback(mapEl, 'تعذّر تحميل الخريطة. تحقق من الاتصال ثم أعد فتح الصفحة.'); return () => { card._cleanup(); unfit(); }; }

  const markers = new Map(); // user_id -> {marker, row}
  const helpMarkers = [];
  let rows = new Map();
  let fitted = false;

  const freshness = (row) => {
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (isDegraded()) return 'stale';
    return age < FRESH_MS ? '' : age < STALE_MS ? 'stale' : 'old';
  };
  const iconFor = (row, url) => {
    const p = member(row.user_id);
    const inner = url ? `<img src="${esc(url)}" alt="">` : esc(initials(p?.display_name));
    return L.divIcon({ className: `nr-marker ${freshness(row)}`, iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -20],
      html: `<div class="m">${inner}</div><div class="lbl">${esc(p?.display_name || 'عضو')}${row.user_id === myId() ? ' (أنت)' : ''}</div>` });
  };
  const popupFor = (row) => {
    const p = member(row.user_id);
    const age = Date.now() - new Date(row.updated_at).getTime();
    const tag = age < FRESH_MS ? 'موقع حديث' : 'موقع قديم — قد لا يكون مكانه الحالي';
    return `<b>${esc(p?.display_name || 'عضو')}</b><br>آخر تحديث: ${esc(fmtRelative(row.updated_at))}<br>${esc(tag)}` +
      (row.accuracy_m ? `<br>الدقة: ±${Math.round(row.accuracy_m)} م` : '') +
      `<br><a href="https://www.google.com/maps/dir/?api=1&destination=${row.lat},${row.lng}" target="_blank" rel="noopener">اتجاهات</a>`;
  };

  function upsert(row) {
    if (new Date(row.share_until) <= new Date()) { remove(row.user_id); return; }
    rows.set(row.user_id, row);
    const p = member(row.user_id);
    const existing = markers.get(row.user_id);
    const setIcon = (m, url) => m.setIcon(iconFor(row, url));
    if (existing) {
      existing.marker.setLatLng([row.lat, row.lng]);
      existing.row = row;
      setIcon(existing.marker, existing.url);
      existing.marker.setPopupContent(popupFor(row));
    } else {
      const m = L.marker([row.lat, row.lng], { icon: iconFor(row, null) }).bindPopup(popupFor(row)).addTo(map);
      const entry = { marker: m, row, url: null };
      markers.set(row.user_id, entry);
      if (p?.avatar_path) signedUrl(p.avatar_path).then((u) => { if (u && markers.get(row.user_id) === entry) { entry.url = u; setIcon(m, u); } });
    }
    drawCount();
  }
  function remove(uid) {
    const e = markers.get(uid);
    if (e) { e.marker.remove(); markers.delete(uid); }
    rows.delete(uid);
    drawCount();
  }
  function drawCount() { countChip.textContent = `${markers.size} عضو`; countChip.className = 'chip' + (markers.size ? ' green' : ''); }

  async function loadAll() {
    try {
      const data = await must(state.sb.from('member_locations').select('*').gt('share_until', new Date().toISOString()));
      const seen = new Set(data.map((r) => r.user_id));
      [...markers.keys()].forEach((k) => { if (!seen.has(k)) remove(k); });
      data.forEach(upsert);
      if (!fitted && markers.size) {
        fitted = true;
        const b = L.latLngBounds([...markers.values()].map((e) => e.marker.getLatLng()));
        map.fitBounds(b, { padding: [60, 60], maxZoom: 14 });
      }
      helpMarkers.forEach((m) => m.remove()); helpMarkers.length = 0;
      const help = await must(state.sb.from('help_requests').select('*').eq('status', 'open').not('lat', 'is', null));
      help.forEach((r) => helpMarkers.push(L.marker([r.lat, r.lng], { icon: pinIcon(L, '#ff3b4f', '!') })
        .bindPopup(`<b>طلب مساعدة: ${esc(HELP_KIND[r.kind])}</b><br>${esc(member(r.user_id)?.display_name || 'عضو')} · ${esc(fmtRelative(r.created_at))}<br><a href="#/help">عرض الطلب</a>`).addTo(map)));
    } catch (e) { toast('تعذّر تحديث المواقع', 'err'); console.error(e); }
  }

  await loadAll();
  const ch = watchChannel(state.sb.channel('map-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, (p) => {
      if (p.eventType === 'DELETE') remove(p.old.user_id); else upsert(p.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, loadAll));
  // تحديث مؤشرات القِدم وإزالة المنتهي كل 30 ثانية
  const tick = setInterval(() => {
    for (const [uid, e] of markers) {
      if (new Date(e.row.share_until) <= new Date()) remove(uid);
      else { e.marker.setIcon(iconFor(e.row, e.url)); e.marker.setPopupContent(popupFor(e.row)); }
    }
  }, 30000);
  const offs = [on('net', () => markers.forEach((e) => e.marker.setIcon(iconFor(e.row, e.url)))), on('reconnected', loadAll)];
  return () => { clearInterval(tick); state.sb.removeChannel(ch); offs.forEach((f) => f()); card._cleanup(); unfit(); map.remove(); };
}
