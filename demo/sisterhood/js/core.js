// الإعدادات، عميل Supabase، الحالة العامة، الأعضاء، الاتصال والتحديث المباشر
import { h, toast } from './ui.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const state = {
  cfg: null,
  preview: false,
  sb: null,
  session: null,
  me: null,            // صف profiles الخاص بي
  members: new Map(),  // id -> profile (المسموح لي برؤيتهم فقط حسب RLS)
  online: navigator.onLine,
  rtOk: true,
};

// ---------- ناقل أحداث بسيط ----------
const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt)?.delete(fn);
}
export function emit(evt, data) { listeners.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

export const isAdmin = () => state.me?.status === 'active' && (state.me.role === 'admin' || state.me.role === 'owner');
export const isOwner = () => state.me?.status === 'active' && state.me.role === 'owner';
export const myId = () => state.session?.user?.id || null;

export function configProblem() {
  const c = window.NR_CONFIG;
  if (window.NR_CONFIG_MISSING || !c) return 'missing';
  if (!c.supabaseUrl || /YOUR-PROJECT/.test(c.supabaseUrl) || !c.supabaseAnonKey || /YOUR-ANON/.test(c.supabaseAnonKey)) return 'placeholder';
  if (/service_role/i.test(c.supabaseAnonKey)) return 'service_role';
  try {
    const payload = JSON.parse(atob(c.supabaseAnonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role === 'service_role') return 'service_role';
  } catch { /* مفاتيح publishable الجديدة ليست JWT */ }
  return null;
}

/** هوية القروب من config.js: الاسم والمدينة والألوان */
export const brand = () => state.cfg?.brand || { name: 'Jeddah Ride', wordmark: ['Jeddah ', 'Ride'], city: 'جدة' };
function applyBrand() {
  const b = brand();
  document.title = b.name;
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', b.name);
  document.querySelectorAll('img.brand-logo').forEach((i) => { i.alt = b.name; });
  const c = b.colors || {};
  const hex = (v) => /^#[0-9a-f]{6}$/i.test(v || '') ? v : null;
  const rgb = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).join(',');
  const st = document.documentElement.style;
  if (hex(c.from) && hex(c.to)) st.setProperty('--accent-grad', `linear-gradient(135deg, ${c.from} 0%, ${c.to} 100%)`);
  if (hex(c.accent)) {
    st.setProperty('--accent', c.accent);
    st.setProperty('--glow', `0 0 0 1px rgba(${rgb(c.accent)},.35), 0 8px 30px -10px rgba(${rgb(c.accent)},.55)`);
  }
  if (hex(c.highlight)) st.setProperty('--cyan', c.highlight);
}

export async function initClient({ preview }) {
  state.preview = preview;
  state.cfg = Object.assign({
    storageBucket: 'nightriders', routingUrl: '', tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; OpenStreetMap contributors', defaultCenter: [21.5433, 39.1728], defaultZoom: 11,
  }, window.NR_CONFIG || {});
  state.cfg.brand = Object.assign({ name: 'Jeddah Ride', wordmark: ['Jeddah ', 'Ride'], city: 'جدة' }, state.cfg.brand || {});
  applyBrand();
  if (preview) {
    const { createMockClient } = await import('./mock.js');
    state.sb = createMockClient();
    document.getElementById('preview-banner').hidden = false;
  } else {
    const { createClient } = await import(SUPABASE_ESM);
    state.sb = createClient(state.cfg.supabaseUrl, state.cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return state.sb;
}

/** ينفّذ استعلام Supabase ويرمي الخطأ إن وُجد */
export async function must(p) {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// ---------- الملف الشخصي والأعضاء ----------
export async function loadMe() {
  const uid = myId();
  if (!uid) { state.me = null; return null; }
  const { data, error } = await state.sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  state.me = data;
  if (data) state.members.set(data.id, data);
  return data;
}

export async function loadMembers() {
  const rows = await must(state.sb.from('profiles').select('*').order('display_name'));
  state.members = new Map(rows.map((r) => [r.id, r]));
  if (state.me && state.members.has(state.me.id)) state.me = state.members.get(state.me.id);
  emit('members');
  return state.members;
}
export const member = (id) => state.members.get(id) || null;
export const memberName = (id) => state.members.get(id)?.display_name || 'عضو';
export const isReady = (p) => !!p?.ready_until && new Date(p.ready_until) > new Date();

// ---------- التحديث المباشر العام ----------
let globalChannel = null;
export function startGlobalRealtime() {
  stopGlobalRealtime();
  const sb = state.sb;
  globalChannel = sb.channel('nr-global')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => {
      if (p.eventType === 'DELETE') { state.members.delete(p.old.id); emit('members'); return; }
      const row = p.new;
      state.members.set(row.id, row);
      if (row.id === myId()) {
        const prev = state.me?.status;
        state.me = row;
        emit('me', row);
        if (prev && prev !== row.status) emit('status-changed', row.status);
      }
      emit('members');
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'help_requests' }, (p) => {
      emit('help', p);
      if (p.new.user_id !== myId()) emit('help-new', p.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'help_requests' }, (p) => emit('help', p))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'help_requests' }, (p) => emit('help', p));
  watchChannel(globalChannel);
}
export function stopGlobalRealtime() {
  if (globalChannel) { state.sb.removeChannel(globalChannel); globalChannel = null; }
}

/** يراقب حالة قناة التحديث المباشر لعرض حالة الاتصال بصدق */
export function watchChannel(ch) {
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') setRt(true);
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      if (ch === globalChannel || status !== 'CLOSED') setRt(false);
    }
  });
  return ch;
}

// ---------- حالة الاتصال ----------
let wasDegraded = false;
function setRt(ok) {
  if (state.rtOk === ok) return;
  state.rtOk = ok;
  renderNet();
}
export function initNetwork() {
  window.addEventListener('online', () => { state.online = true; renderNet(); });
  window.addEventListener('offline', () => { state.online = false; renderNet(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.me?.status === 'active') emit('resume');
  });
  renderNet();
}
function renderNet() {
  const el = document.getElementById('net-banner');
  const degraded = !state.online || !state.rtOk;
  if (!state.online) {
    el.textContent = 'لا يوجد اتصال بالإنترنت — ما يظهر الآن قد يكون قديمًا وليس مباشرًا';
    el.className = 'net-banner'; el.hidden = false;
  } else if (!state.rtOk) {
    el.textContent = 'التحديث المباشر متوقف — جارٍ إعادة الاتصال… (البيانات قد لا تكون محدّثة)';
    el.className = 'net-banner warn'; el.hidden = false;
  } else {
    el.hidden = true;
  }
  document.body.classList.toggle('degraded', degraded);
  if (wasDegraded && !degraded) {
    toast('عاد الاتصال — تم تحديث البيانات', 'ok', 2200);
    emit('reconnected');
  }
  wasDegraded = degraded;
  emit('net', { degraded });
}
export const isDegraded = () => !state.online || !state.rtOk;

export function liveHint() {
  return isDegraded() ? h('span', { class: 'chip amber' }, 'غير مباشر') : null;
}
