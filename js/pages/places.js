// دليل المحلات: صيانة، قطع غيار، تأجير دبابات، محطات — مرتبة من الأقرب
import { h, mount, icon, topbar, loadingView, errorView, emptyView, openSheet, openInMaps, confirmDialog, toast, errMsg, actionBtn, PLACE_CAT } from '../ui.js';
import { state, must, myId, isAdmin, memberName } from '../core.js';
import { makeMap, mapFallback, pinIcon, getPosition, geoErrorText } from '../geo.js';

const COLORS = { repair: '#ff8a3d', parts: '#4f7dff', rental: '#a26bff', fuel: '#22c55e', other: '#8b93a8' };
const LETTER = { repair: 'ص', parts: 'ق', rental: 'ت', fuel: 'م', other: '•' };

export function distanceKm(a, b) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// أماكن عامة من OpenStreetMap (Overpass) حول نقطة — للمحطات خصوصًا
const OSM_Q = {
  fuel: ['nwr["amenity"="fuel"]'],
  repair: ['nwr["shop"="motorcycle_repair"]', 'nwr["shop"="motorcycle"]["service:vehicle:repairs"="yes"]', 'nwr["craft"="motorcycle_repair"]'],
  parts: ['nwr["shop"="motorcycle"]', 'nwr["shop"="motorcycle_parts"]'],
  rental: ['nwr["amenity"="motorcycle_rental"]', 'nwr["shop"="motorcycle_rental"]'],
};
const osmCache = new Map();
async function fetchOsm(cat, c, radiusM = 8000) {
  if (!OSM_Q[cat]) return [];
  const key = `${cat}:${c.lat.toFixed(2)}:${c.lng.toFixed(2)}`;
  if (osmCache.has(key)) return osmCache.get(key);
  const body = `[out:json][timeout:20];(${OSM_Q[cat].map((q) => `${q}(around:${radiusM},${c.lat},${c.lng});`).join('')});out center 60;`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(body),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
    if (!r.ok) throw new Error('osm_failed');
    const j = await r.json();
    const out = j.elements.map((e) => {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon, tg = e.tags || {};
      const name = tg['name:ar'] || tg.name || tg.brand || (cat === 'fuel' ? 'محطة بنزين' : 'محل دبابات');
      return lat == null ? null : { id: `osm-${e.type}-${e.id}`, osm: true, category: cat, name, lat, lng,
        phone: (tg.phone || tg['contact:phone'] || '').replace(/[^\d+ ]/g, '').trim() || null, hours: tg.opening_hours || null, notes: null };
    }).filter(Boolean);
    osmCache.set(key, out);
    return out;
  } finally { clearTimeout(t); }
}

const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(km < 10 ? 1 : 0)} كم`);

export default async function placesPage(root, [catParam]) {
  let cat = PLACE_CAT[catParam] ? catParam : 'repair';
  let rows = [], me = null, osm = [], osmState = '';
  const mapEl = h('div', { class: 'mini-map places-map' });
  const catRow = h('div', { class: 'picker-row scroll-x' });
  const list = h('div', { class: 'stack', style: { gap: '8px' } }, loadingView());
  const locLine = h('div', { class: 'row between' });

  mount(root, topbar({ title: 'دليل المحلات', back: '#/map',
      actions: h('a', { class: 'icon-btn', href: `#/places/new/${cat}`, 'aria-label': 'أضف محل' }, icon('plus')) }),
    h('div', { class: 'content stack' }, catRow, mapEl, locLine, list,
      h('a', { class: 'btn block', href: `#/places/new/${cat}`, id: 'addPlaceBtn' }, icon('plus'), 'أضف محل تعرفه'),
      h('div', { class: 'xs muted', style: { textAlign: 'center' } }, 'الملوّنة أضافها أعضاء القروب، والرمادية من الخريطة العامة (OpenStreetMap). موقعك يُستخدم للترتيب فقط ولا يُحفظ.')));

  let L = null, map = null, layer = null;
  try { ({ L, map } = await makeMap(mapEl, { zoom: 11 })); layer = L.layerGroup().addTo(map); }
  catch { mapFallback(mapEl, 'تعذّر تحميل الخريطة — القائمة تحت تعمل.'); }
  let meMarker = null;

  function drawCats() {
    catRow.replaceChildren(...Object.entries(PLACE_CAT).map(([k, t]) =>
      h('button', { type: 'button', class: 'pick' + (cat === k ? ' on' : ''), onclick: () => {
        cat = k; history.replaceState(null, '', `#/places/${k}`);
        document.getElementById('addPlaceBtn')?.setAttribute('href', `#/places/new/${k}`);
        drawCats(); draw(true); loadOsm();
      } }, t)));
  }

  function drawLoc() {
    locLine.replaceChildren(
      h('div', { class: 'small muted' }, me ? 'مرتبة من الأقرب لموقعك' : 'رتّبها حسب الأقرب لك'),
      actionBtn(me ? 'تحديث موقعي' : 'الأقرب لي', 'sm', locate, 'locate'));
  }
  async function locate() {
    try {
      const p = await getPosition({ timeout: 12000 });
      me = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (map) {
        meMarker?.remove();
        meMarker = L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#29d3ff', fillOpacity: 1 }).addTo(map).bindTooltip('أنت');
      }
      drawLoc(); draw(true); loadOsm();
    } catch (e) { toast(geoErrorText(e) || e.message, 'err', 5000); }
  }

  let osmSeq = 0;
  async function loadOsm() {
    const c = me || (map ? { lat: map.getCenter().lat, lng: map.getCenter().lng } : null);
    if (!c || !OSM_Q[cat]) { osm = []; osmState = ''; return; }
    const seq = ++osmSeq; osmState = 'loading'; draw(false);
    try { const res = await fetchOsm(cat, c); if (seq !== osmSeq) return; osm = res; osmState = 'ok'; }
    catch { if (seq !== osmSeq) return; osm = []; osmState = 'err'; }
    draw(true);
  }

  function draw(fit) {
    const mine = rows.filter((r) => r.category === cat);
    // استبعاد أماكن OSM المكررة (قريبة جدًا من محل مضاف)
    const extra = osm.filter((o) => o.category === cat && !mine.some((m) => distanceKm(m, o) < 0.05));
    let shown = [...mine, ...extra];
    if (me) shown = shown.map((r) => ({ ...r, _d: distanceKm(me, r) })).sort((a, b) => a._d - b._d);
    if (layer) {
      layer.clearLayers();
      shown.forEach((r) => L.marker([r.lat, r.lng], { icon: pinIcon(L, r.osm ? '#8b93a8' : COLORS[r.category], LETTER[r.category]), opacity: r.osm ? 0.85 : 1 })
        .on('click', () => details(r)).addTo(layer));
      if (fit) {
        const pts = shown.slice(0, me ? 5 : 50).map((r) => [r.lat, r.lng]);
        if (me) pts.push([me.lat, me.lng]);
        if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
        else if (pts.length === 1) map.setView(pts[0], 14);
      }
    }
    const status = osmState === 'loading' ? h('div', { class: 'loading' }, h('div', { class: 'spinner sm' }), 'نجيب الأماكن القريبة من الخريطة العامة…')
      : osmState === 'err' ? h('div', { class: 'xs muted' }, 'تعذّر جلب الأماكن من الخريطة العامة الآن.') : null;
    if (!shown.length) {
      mount(list, status, osmState === 'loading' ? null : emptyView('pin', `ما فيه ${PLACE_CAT[cat]} قريبة مسجّلة`, 'تعرف محل زين؟ أضفه وخلّ الشباب يستفيدون.'));
      return;
    }
    mount(list, status, ...shown.map((r) => h('button', { type: 'button', class: 'place-item', onclick: () => { focus(r); details(r); } },
      h('span', { class: 'place-dot', style: { background: r.osm ? '#5b6378' : COLORS[r.category] } }, LETTER[r.category]),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { style: { fontWeight: 700 } }, r.name),
        r.osm ? h('div', { class: 'xs muted' }, 'من الخريطة العامة') : null,
        r.notes ? h('div', { class: 'xs muted place-note' }, r.notes) : r.hours ? h('div', { class: 'xs muted' }, r.hours) : null),
      r._d != null ? h('span', { class: 'chip' }, fmtDist(r._d)) : null)));
  }
  function focus(r) { if (map) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 15)); }

  function details(r) {
    const canEdit = !r.osm && (r.created_by === myId() || isAdmin());
    const phone = r.phone?.replace(/\s/g, '');
    const wa = phone ? phone.replace(/[^\d]/g, '').replace(/^0/, '966') : null;
    openSheet(r.name, (close) => h('div', { class: 'stack' },
      h('div', { class: 'row wrap', style: { gap: '6px' } },
        h('span', { class: 'chip', style: { color: COLORS[r.category] } }, PLACE_CAT[r.category]),
        me ? h('span', { class: 'chip' }, `يبعد ${fmtDist(distanceKm(me, r))}`) : null),
      r.hours ? h('div', { class: 'row small' }, icon('clock'), h('span', null, r.hours)) : null,
      r.notes ? h('div', { class: 'card small', style: { whiteSpace: 'pre-wrap', lineHeight: 1.7 } }, r.notes) : null,
      h('div', { class: 'xs muted' }, r.osm ? 'من OpenStreetMap — ممكن تكون معلوماته ناقصة' : `أضافه ${memberName(r.created_by)}`),
      h('button', { class: 'btn primary block', onclick: () => { close(); openInMaps(r.lat, r.lng, r.name); } }, icon('nav'), 'وديني له'),
      phone ? h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `tel:${phone}` }, icon('phone'), 'اتصال'),
        h('a', { class: 'btn', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener' }, icon('chat'), 'واتساب')) : null,
      canEdit ? h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `#/place/${r.id}/edit` }, icon('edit'), 'تعديل'),
        actionBtn('حذف', 'danger-soft', async () => {
          if (!(await confirmDialog(`حذف «${r.name}» من الدليل؟`, { danger: true, ok: 'حذف' }))) return;
          const d = await must(state.sb.from('places').delete().eq('id', r.id).select('id'));
          if (!d.length) throw new Error('not_allowed');
          toast('تم الحذف', 'ok'); close(); load();
        }, 'trash')) : null,
      r.osm ? h('a', { class: 'btn block', href: `#/places/new/${r.category}`, onclick: () => { sessionStorage.setItem('nr_place_prefill', JSON.stringify(r)); close(); } }, icon('plus'), 'أضفه للدليل مع ملاحظاتك') : null));
  }

  async function load() {
    try {
      rows = await must(state.sb.from('places').select('*').order('name'));
      draw(true);
      if (!osmState) loadOsm();
    } catch (e) { mount(list, errorView(e, load)); }
  }

  drawCats(); drawLoc();
  // إذا سبق وسمح بالموقع، نرتب تلقائيًا بدون سؤال
  try { const st = await navigator.permissions?.query({ name: 'geolocation' }); if (st?.state === 'granted') locate(); } catch { /* */ }
  await load();
  const ch = state.sb.channel('places-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'places' }, load).subscribe();
  return () => { state.sb.removeChannel(ch); map?.remove(); };
}
