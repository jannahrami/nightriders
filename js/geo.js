// الموقع: إذن الجهاز، مشاركة الموقع المؤقتة، حساب المسار، الخرائط
import { h, icon, openSheet, toast, errMsg } from './ui.js';
import { state, emit, must } from './core.js';

// ---------- قراءة الموقع ----------
export function geoErrorText(err) {
  if (!('geolocation' in navigator)) return 'جهازك أو متصفحك لا يدعم تحديد الموقع.';
  if (!window.isSecureContext) return 'تحديد الموقع يحتاج أن يعمل التطبيق عبر HTTPS.';
  switch (err?.code) {
    case 1: return 'تم رفض إذن الموقع. في iPhone: الإعدادات ← الخصوصية والأمان ← خدمات الموقع ← Safari (أو التطبيق) ← «أثناء الاستخدام»، ثم أعد المحاولة.';
    case 2: return 'تعذّر تحديد موقعك الآن (GPS غير متاح أو الإشارة ضعيفة). جرّب في مكان مفتوح.';
    case 3: return 'انتهت مهلة تحديد الموقع. تأكد من تفعيل خدمات الموقع وحاول مجددًا.';
    default: return err?.message || 'تعذّر تحديد الموقع.';
  }
}
export function getPosition({ timeout = 15000, maximumAge = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator) || !window.isSecureContext) { reject(new Error(geoErrorText(null))); return; }
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(geoErrorText(e))),
      { enableHighAccuracy: true, timeout, maximumAge });
  });
}

// ---------- مشاركة الموقع (متوقفة افتراضيًا) ----------
const KEY = 'nr.sharing';
const MIN_INTERVAL = 15000;     // أقل فاصل بين إرسالين
const MIN_MOVE_M = 40;          // أو عند التحرك لمسافة
const HEARTBEAT = 60000;        // تحديث دوري إذا كانت القراءة حديثة
export const FRESH_MS = 2 * 60000;
export const STALE_MS = 10 * 60000;

function distM(a, b) {
  const R = 6371000, toR = (x) => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const sharing = {
  active: false, until: null, rideId: null, lastSent: null, lastFix: null, lastError: null, sending: false,
  _watch: null, _endTimer: null, _hb: null, _lastSentPos: null,

  async start({ until, rideId = null }) {
    const pos = await getPosition();                 // يطلب إذن الجهاز
    this.active = true; this.until = until; this.rideId = rideId; this.lastError = null;
    this._lastSentPos = null;
    await this._send(pos, true);
    if (!this.active) return;
    try { localStorage.setItem(KEY, JSON.stringify({ until, rideId, uid: state.session?.user?.id })); } catch { /* */ }
    this._arm();
    emit('sharing');
  },

  resume() {
    let saved; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
    if (!saved || saved.uid !== state.session?.user?.id || new Date(saved.until) <= new Date()) {
      try { localStorage.removeItem(KEY); } catch { /* */ }
      return false;
    }
    this.active = true; this.until = saved.until; this.rideId = saved.rideId;
    this._arm();
    getPosition().then((p) => this._send(p, true)).catch((e) => { this.lastError = e.message; emit('sharing'); });
    emit('sharing');
    return true;
  },

  _arm() {
    this._clearTimers();
    if ('geolocation' in navigator) {
      this._watch = navigator.geolocation.watchPosition(
        (p) => this._send(p, false),
        (e) => { this.lastError = geoErrorText(e); emit('sharing'); if (e.code === 1) this.stop('permission'); },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    }
    const ms = new Date(this.until).getTime() - Date.now();
    this._endTimer = setTimeout(() => this.stop('expired'), Math.max(0, ms));
    this._hb = setInterval(() => {
      if (new Date(this.until) <= new Date()) { this.stop('expired'); return; }
      if (this.lastFix && Date.now() - this.lastFix.timestamp < FRESH_MS) this._send(this.lastFix, true);
    }, HEARTBEAT);
    this._onVis = () => {
      if (document.visibilityState === 'visible' && this.active) {
        if (new Date(this.until) <= new Date()) { this.stop('expired'); return; }
        getPosition({ maximumAge: 0 }).then((p) => this._send(p, true)).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._onVis);
  },

  async _send(pos, force) {
    if (!this.active) return;
    this.lastFix = pos;
    const cur = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const now = Date.now();
    if (!force && this.lastSent && now - this.lastSent < MIN_INTERVAL &&
        this._lastSentPos && distM(this._lastSentPos, cur) < MIN_MOVE_M) return;
    if (this.sending) return;
    this.sending = true;
    try {
      await must(state.sb.rpc('share_location', {
        p_lat: cur.lat, p_lng: cur.lng,
        p_accuracy: pos.coords.accuracy ?? null,
        p_heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        p_speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
        p_ride: this.rideId, p_share_until: this.until,
      }));
      this.lastSent = Date.now(); this._lastSentPos = cur; this.lastError = null;
    } catch (e) {
      this.lastError = errMsg(e);
      if (/members_only|ride_closed|share_until_past/.test(String(e.message))) { this.sending = false; this.stop('server'); return; }
    } finally { this.sending = false; }
    emit('sharing');
  },

  _clearTimers() {
    if (this._watch != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(this._watch);
    this._watch = null;
    clearTimeout(this._endTimer); clearInterval(this._hb);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
  },

  async stop(reason = 'user') {
    const was = this.active;
    this.active = false;
    this._clearTimers();
    try { localStorage.removeItem(KEY); } catch { /* */ }
    this.until = null; this.rideId = null;
    emit('sharing');
    if (!was && reason !== 'user') return;
    try { await must(state.sb.rpc('stop_location_sharing')); }
    catch (e) { if (reason === 'user') throw e; }
    if (reason === 'expired') toast('انتهت مدة مشاركة موقعك وتوقفت المشاركة', '', 4000);
    if (reason === 'permission') toast('توقفت مشاركة الموقع لأن الإذن رُفض', 'err', 4500);
  },

  /** إيقاف محلي فقط (عند تسجيل الخروج أو الإيقاف) */
  haltLocal() { this.active = false; this._clearTimers(); try { localStorage.removeItem(KEY); } catch { /* */ } emit('sharing'); },
};

// ---------- حساب المسار (OSRM) ----------
function thin(coords, max = 600) {
  if (coords.length <= max) return coords;
  const step = coords.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.floor(i * step)]);
  out.push(coords[coords.length - 1]);
  return out.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}
/** يعيد {distance_km, geojson} أو null إذا تعذّر حساب مسار فعلي */
export async function computeRoute(points) {
  const base = (state.cfg.routingUrl || '').replace(/\/$/, '');
  if (!base || points.length < 2 || state.preview) return null;
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes?.[0]) return null;
    const route = j.routes[0];
    return {
      distance_km: Math.round(route.distance / 100) / 10,
      geojson: { type: 'LineString', coordinates: thin(route.geometry.coordinates) },
    };
  } catch { return null; } finally { clearTimeout(t); }
}

// ---------- Leaflet ----------
let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    const to = setTimeout(() => { leafletP = null; reject(new Error('map_load_timeout')); }, 15000);
    s.onload = () => { clearTimeout(to); window.L ? resolve(window.L) : reject(new Error('map_load_failed')); };
    s.onerror = () => { clearTimeout(to); leafletP = null; reject(new Error('map_load_failed')); };
    document.head.appendChild(s);
  });
  return leafletP;
}
export async function makeMap(el, { center, zoom, zoomControl = true } = {}) {
  if (window.NR_NO_MAP) throw new Error('map_disabled_in_preview');
  const L = await loadLeaflet();
  el.setAttribute('dir', 'ltr');
  const map = L.map(el, { zoomControl, attributionControl: true, tap: true })
    .setView(center || state.cfg.defaultCenter, zoom || state.cfg.defaultZoom);
  L.tileLayer(state.cfg.tileUrl, { attribution: state.cfg.tileAttribution, maxZoom: 19, className: 'nr-tiles' }).addTo(map);
  map.attributionControl.setPrefix(false);
  setTimeout(() => map.invalidateSize(), 120);
  return { L, map };
}
export function mapFallback(el, msg) {
  if (window.NR_NO_MAP) msg = 'الخريطة لا تظهر في رابط المعاينة هذا. تعمل بعد نشر التطبيق على استضافتك.';
  el.replaceChildren(h('div', { class: 'map-fallback' }, msg || 'تعذّر تحميل الخريطة (تحقق من الاتصال). النقاط متاحة كنص وروابط.'));
}
export function pinIcon(L, color, label) {
  return L.divIcon({ className: 'nr-pin', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30],
    html: `<div class="p" style="background:${color}"><span>${label}</span></div>` });
}

/** يستخرج إحداثيات من نص أو رابط خرائط */
export function parseLatLng(text) {
  if (!text) return null;
  const t = decodeURIComponent(String(text));
  const pats = [/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|daddr|destination|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/];
  for (const re of pats) {
    const m = t.match(re);
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}


// ---------- البحث عن مكان بالاسم (OpenStreetMap Nominatim) ----------
let lastSearch = 0;
export async function searchPlaces(q, map) {
  const wait = 1100 - (Date.now() - lastSearch);         // سياسة الخدمة: طلب واحد بالثانية كحد أقصى
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const params = new URLSearchParams({ format: 'jsonv2', q, countrycodes: 'sa', 'accept-language': 'ar', limit: '7', addressdetails: '0' });
  if (map) { const b = map.getBounds().pad(2); params.set('viewbox', `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`); }
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error('search_failed');
    const rows = await r.json();
    return rows.map((x) => ({ lat: +x.lat, lng: +x.lon, name: x.name || x.display_name.split('،')[0].split(',')[0], full: x.display_name }));
  } finally { clearTimeout(t); }
}

/** نافذة اختيار نقطة: حرّك الخريطة حتى يكون العلامة في المكان المطلوب */
export function pickPoint({ title = 'اختر النقطة على الخريطة', initial } = {}) {
  return new Promise((resolve) => {
    let result = null, map = null;
    openSheet(title, (close) => {
      const mapEl = h('div', { class: 'picker-map', style: { position: 'relative' } });
      const cross = h('div', { style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-100%)', zIndex: 800, pointerEvents: 'none', color: '#29d3ff' } }, icon('pin'));
      cross.firstChild.setAttribute('width', '40'); cross.firstChild.setAttribute('height', '40');
      const wrap = h('div', { style: { position: 'relative' } }, mapEl, cross);
      const coordsTxt = h('div', { class: 'xs muted ltr' }, '');
      let picked = null;   // آخر مكان اختير من البحث
      const q = h('input', { class: 'input', type: 'search', placeholder: 'ابحث عن مكان: محطة، كوفي، حي…', enterkeyhint: 'search' });
      const results = h('div', { class: 'search-results', hidden: true });
      const sBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'بحث' }, icon('search'));
      const doSearch = async () => {
        const text = q.value.trim();
        if (text.length < 2 || sBtn.classList.contains('busy')) return;
        sBtn.classList.add('busy'); err.hidden = true;
        results.hidden = false; results.replaceChildren(h('div', { class: 'xs muted', style: { padding: '10px' } }, 'جارٍ البحث…'));
        try {
          const rows = await searchPlaces(text, map);
          if (!rows.length) { results.replaceChildren(h('div', { class: 'xs muted', style: { padding: '10px' } }, 'ما لقيت نتائج. جرّب اسم ثاني أو حرّك الخريطة بنفسك.')); return; }
          results.replaceChildren(...rows.map((r) => h('button', { type: 'button', class: 'search-item', onclick: () => {
            picked = r; results.hidden = true; q.value = r.name;
            if (map) map.setView([r.lat, r.lng], 16); else { manual.value = `${r.lat}, ${r.lng}`; }
          } }, h('b', null, r.name), h('span', null, r.full))));
        } catch { results.replaceChildren(h('div', { class: 'xs muted', style: { padding: '10px' } }, 'تعذّر البحث الآن. تأكد من الإنترنت، أو حرّك الخريطة بنفسك.')); }
        finally { sBtn.classList.remove('busy'); }
      };
      sBtn.onclick = doSearch;
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
      const searchBox = h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'row', style: { gap: '8px' } }, q, sBtn), results);
      const manual = h('input', { class: 'input', placeholder: 'أو الصق إحداثيات / رابط Google Maps', inputmode: 'text' });
      const err = h('div', { class: 'form-error', hidden: true });
      const update = () => { if (map) { const c = map.getCenter(); coordsTxt.textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`; } };
      makeMap(mapEl, { center: initial ? [initial.lat, initial.lng] : undefined, zoom: initial ? 15 : undefined })
        .then(({ map: m }) => { map = m; map.on('move', update); update(); })
        .catch(() => { mapFallback(mapEl, 'تعذّر تحميل الخريطة. أدخل الإحداثيات أو الصق رابط الموقع.'); cross.remove(); });
      const locBtn = h('button', { class: 'btn sm', type: 'button' }, icon('locate'), 'موقعي الحالي');
      locBtn.onclick = async () => {
        locBtn.classList.add('busy'); err.hidden = true;
        try {
          const p = await getPosition();
          const ll = [p.coords.latitude, p.coords.longitude];
          if (map) map.setView(ll, 16); else { result = { lat: ll[0], lng: ll[1] }; manual.value = ll.join(', '); }
        } catch (e) { err.textContent = e.message; err.hidden = false; }
        finally { locBtn.classList.remove('busy'); }
      };
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'اعتماد هذه النقطة');
      ok.onclick = () => {
        const typed = parseLatLng(manual.value);
        if (manual.value.trim() && !typed) { err.textContent = 'لم أتعرف على الإحداثيات. مثال: 24.7136, 46.6753'; err.hidden = false; return; }
        if (typed) result = typed;
        else if (map) { const c = map.getCenter(); result = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }; }
        if (result && picked && Math.abs(picked.lat - result.lat) < 0.002 && Math.abs(picked.lng - result.lng) < 0.002) result.label = picked.name;
        if (!result) { err.textContent = 'حدد نقطة أولًا.'; err.hidden = false; return; }
        close();
      };
      return h('div', { class: 'stack' }, searchBox, wrap, h('div', { class: 'row between' }, coordsTxt, locBtn), manual, err,
        h('div', { class: 'btn-row' }, ok, h('button', { class: 'btn', type: 'button', onclick: () => { result = null; close(); } }, 'إلغاء')));
    }, () => { if (map) map.remove(); resolve(result); });
  });
}
