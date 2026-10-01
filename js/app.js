// نقطة البداية: الإعداد، بوابة الدخول، التوجيه، الهيكل العام
import { h, mount, icon, toast, errMsg } from './ui.js';
import { state, on, initClient, configProblem, loadMe, loadMembers, startGlobalRealtime, stopGlobalRealtime, initNetwork, isAdmin, myId } from './core.js';
import { sharing } from './geo.js';
import * as auth from './pages/auth.js';
import * as voice from './voice.js';

const app = document.getElementById('app');
let shell = null, pageRoot = null, navEl = null, cleanup = null, appBooted = false, routeSeq = 0;

const ROUTES = [
  [/^$/, () => import('./pages/home.js'), 'home'],
  [/^home$/, () => import('./pages/home.js'), 'home'],
  [/^rides$/, () => import('./pages/rides.js'), 'rides'],
  [/^rides\/new$/, () => import('./pages/ride-form.js'), 'rides'],
  [/^ride\/([\w-]+)$/, () => import('./pages/ride.js'), 'rides'],
  [/^ride\/([\w-]+)\/edit$/, () => import('./pages/ride-form.js'), 'rides'],
  [/^ride\/([\w-]+)\/album$/, () => import('./pages/album.js'), 'rides'],
  [/^map$/, () => import('./pages/map.js'), 'map'],
  [/^chat$/, () => import('./pages/chat.js'), 'chat'],
  [/^chat\/([\w-]+)$/, () => import('./pages/chat.js'), 'chat'],
  [/^me$/, () => import('./pages/profile.js'), 'me'],
  [/^me\/edit$/, () => import('./pages/profile-edit.js'), 'me'],
  [/^members$/, () => import('./pages/members.js'), 'me'],
  [/^member\/([\w-]+)$/, () => import('./pages/member.js'), 'me'],
  [/^help$/, () => import('./pages/help.js'), 'home'],
  [/^help\/new$/, () => import('./pages/help-new.js'), 'home'],
  [/^market$/, () => import('./pages/market.js'), 'home'],
  [/^market\/new$/, () => import('./pages/listing-form.js'), 'home'],
  [/^market\/([\w-]+)$/, () => import('./pages/listing.js'), 'home'],
  [/^market\/([\w-]+)\/edit$/, () => import('./pages/listing-form.js'), 'home'],
  [/^places$/, () => import('./pages/places.js'), 'map'],
  [/^places\/new(?:\/(\w+))?$/, () => import('./pages/place-form.js'), 'map'],
  [/^places\/(repair|parts|rental|fuel|other)$/, () => import('./pages/places.js'), 'map'],
  [/^place\/([\w-]+)\/edit$/, () => import('./pages/place-form.js'), 'map'],
  [/^admin$/, () => import('./pages/admin.js'), 'me'],
  [/^voice$/, () => import('./pages/voice.js'), 'chat'],
];

function currentPath() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { path: path.replace(/\/$/, ''), query: new URLSearchParams(qs || '') };
}

// ---------- الهيكل ----------
function buildShell() {
  pageRoot = h('main', { id: 'page', class: 'shell-page' });
  const link = (key, href, ic, label) => h('a', { href, dataset: { key }, 'aria-label': label }, icon(ic), h('span', null, label));
  navEl = h('nav', { class: 'bottom-nav', 'aria-label': 'التنقل الرئيسي' },
    link('home', '#/home', 'home', 'الرئيسية'),
    link('rides', '#/rides', 'route', 'الطلعات'),
    link('map', '#/map', 'map', 'الخريطة'),
    link('chat', '#/chat', 'chat', 'الشات'),
    link('me', '#/me', 'user', 'حسابي'));
  shell = h('div', { class: 'shell' }, pageRoot, navEl);
  mount(app, shell);
  pinNav(navEl);
  voicePill();
}
// شريط صغير يظهر وأنت في الغرفة الصوتية وتتنقل في صفحات ثانية
let voicePillOff = null;
function voicePill() {
  voicePillOff?.();
  const pill = h('div', { class: 'voice-pill', hidden: true });
  shell.appendChild(pill);
  const draw = () => {
    const vi = voice.voiceInfo();
    const onPage = /^#\/?voice/.test(location.hash);
    pill.hidden = vi.status !== 'in' || onPage;
    if (pill.hidden) return;
    mount(pill,
      h('a', { href: '#/voice' }, icon('mic'), h('span', null, `أنت في الغرفة الصوتية · ${vi.count}`)),
      h('button', { type: 'button', class: vi.muted ? 'off' : '', 'aria-label': vi.muted ? 'افتح المايك' : 'اكتم', onclick: voice.toggleMute }, icon(vi.muted ? 'micoff' : 'mic')),
      h('button', { type: 'button', class: 'leave', 'aria-label': 'خروج', onclick: voice.leave }, icon('phoneoff')));
  };
  const off = on('voice', draw);
  window.addEventListener('hashchange', draw);
  voicePillOff = () => { off(); window.removeEventListener('hashchange', draw); };
  draw();
}
// iPhone (خصوصًا iOS 26) أحيانًا يترك الشريط السفلي معلّقًا في نص الشاشة بعد ما ينقفل الكيبورد.
// نقيس مكانه الفعلي ونرجّعه لأسفل الشاشة المرئية.
let pinCleanup = null;
function pinNav(nav) {
  pinCleanup?.();
  const vv = window.visualViewport;
  if (!vv) return;
  let raf = 0, shift = 0;
  const typing = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  const fix = () => {
    raf = 0;
    if (!nav.isConnected || window.matchMedia('(min-width: 900px)').matches || typing()) {
      if (shift) { shift = 0; nav.style.transform = ''; }
      return;
    }
    const bottom = nav.getBoundingClientRect().bottom - shift;      // مكانه بدون التصحيح
    const want = vv.offsetTop + vv.height;                           // أسفل الجزء الظاهر من الشاشة
    const d = Math.round(want - bottom);
    const next = Math.abs(d) > 2 && Math.abs(d) < 600 ? d : 0;
    if (next !== shift) { shift = next; nav.style.transform = shift ? `translateY(${shift}px)` : ''; }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(fix); };
  const late = () => { schedule(); [100, 300, 600, 1000].forEach((ms) => setTimeout(schedule, ms)); };
  vv.addEventListener('resize', late);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', late);
  document.addEventListener('focusout', late);
  document.addEventListener('focusin', late);
  document.addEventListener('visibilitychange', late);
  window.addEventListener('hashchange', late);
  late();
  pinCleanup = () => {
    vv.removeEventListener('resize', late); vv.removeEventListener('scroll', schedule);
    window.removeEventListener('scroll', schedule); window.removeEventListener('resize', late);
    document.removeEventListener('focusout', late); document.removeEventListener('focusin', late);
    document.removeEventListener('visibilitychange', late); window.removeEventListener('hashchange', late);
  };
}
function setNav(key) {
  navEl?.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.key === key));
}
function refreshHelpDot(count) {
  const a = navEl?.querySelector('a[data-key="home"]');
  if (!a) return;
  a.querySelector('.nav-dot')?.remove();
  if (count > 0) a.appendChild(h('span', { class: 'nav-dot', title: 'طلب مساعدة مفتوح' }));
}

async function route() {
  if (!appBooted) return;
  const seq = ++routeSeq;
  const { path, query } = currentPath();
  if (path === 'admin' && !isAdmin()) { location.hash = '#/home'; return; }
  const hit = ROUTES.find(([re]) => re.test(path));
  if (!hit) { location.hash = '#/home'; return; }
  const [re, loader, navKey] = hit;
  const params = path.match(re).slice(1);
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  setNav(navKey);
  window.scrollTo(0, 0);
  const root = h('div', { class: 'page' });
  mount(pageRoot, root);
  try {
    const mod = await loader();
    if (seq !== routeSeq) return;
    const c = await mod.default(root, params, query);
    if (seq !== routeSeq) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    if (seq !== routeSeq) return;
    mount(root, h('div', { class: 'content' }, h('div', { class: 'card error-box' },
      h('div', { class: 'h3' }, 'تعذّر فتح الصفحة'), h('div', { class: 'small muted' }, errMsg(e)),
      h('button', { class: 'btn sm', onclick: route }, 'إعادة المحاولة'))));
  }
}
export const rerender = () => route();

// ---------- بوابة الدخول ----------
async function gate() {
  const { path, query } = currentPath();
  if (!state.session) {
    appBooted = false; stopGlobalRealtime();
    auth.renderAuth(app, { code: path === 'join' ? query.get('code') : null, onDone: gate });
    return;
  }
  let me;
  try { me = await loadMe(); }
  catch (e) {
    appBooted = false;
    mount(app, auth.centerCard('تعذّر الاتصال', errMsg(e), h('button', { class: 'btn primary block', onclick: gate }, 'إعادة المحاولة'),
      h('button', { class: 'btn ghost block', onclick: () => state.sb.auth.signOut() }, 'تسجيل الخروج')));
    return;
  }
  if (!me) { appBooted = false; auth.renderJoin(app, { code: query.get('code'), onDone: gate }); return; }
  if (me.status === 'pending') { appBooted = false; startGlobalRealtime(); auth.renderPending(app, { onRefresh: gate }); import('./push.js').then((m) => m.syncPush()).catch(() => {}); return; }
  if (me.status === 'suspended') { appBooted = false; sharing.haltLocal(); stopGlobalRealtime(); voice.stopVoice(); auth.renderSuspended(app); return; }
  await bootApp();
}

async function bootApp() {
  try { await loadMembers(); } catch (e) { toast(errMsg(e), 'err'); }
  buildShell();
  appBooted = true;
  startGlobalRealtime();
  voice.initVoice();
  sharing.resume();
  updateHelpDot();
  import('./push.js').then((m) => m.syncPush()).catch(() => {});
  if (/^#\/?join/.test(location.hash) || !location.hash) location.hash = '#/home';
  await route();
}

async function updateHelpDot() {
  if (!appBooted) return;
  const { count } = await state.sb.from('help_requests').select('id', { count: 'exact', head: true }).eq('status', 'open');
  refreshHelpDot(count || 0);
}

// ---------- التشغيل ----------
async function start() {
  const params = new URLSearchParams(location.search);
  const wantPreview = params.get('preview') === '1' || window.NR_FORCE_PREVIEW === true;
  const problem = configProblem();
  if (problem && !wantPreview) { auth.renderSetup(app, problem); return; }
  if (problem === 'service_role') { auth.renderSetup(app, problem); return; }

  try { await initClient({ preview: wantPreview }); }
  catch (e) {
    console.error(e);
    mount(app, auth.centerCard('تعذّر تحميل مكتبة Supabase', 'تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.',
      h('button', { class: 'btn primary block', onclick: () => location.reload() }, 'إعادة التحميل')));
    return;
  }
  initNetwork();

  const { data } = await state.sb.auth.getSession();
  state.session = data.session;

  state.sb.auth.onAuthStateChange((event, session) => {
    const prevUser = myId();
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') { auth.openNewPassword(); return; }
    if (event === 'SIGNED_OUT') {
      sharing.haltLocal(); stopGlobalRealtime(); voice.stopVoice(); appBooted = false; state.me = null; state.members = new Map();
      gate(); return;
    }
    if (event === 'SIGNED_IN' && session?.user?.id !== prevUser) setTimeout(gate, 0);
  });

  on('status-changed', (status) => {
    if (status === 'suspended') { sharing.haltLocal(); toast('تم إيقاف حسابك', 'err', 5000); gate(); }
    else if (status === 'active' && !appBooted) { toast('تم قبول عضويتك! أهلًا بك', 'ok', 4000); gate(); }
  });
  on('me', (me) => { if (me.status === 'active' && !isAdmin() && currentPath().path === 'admin') location.hash = '#/home'; });
  on('help', updateHelpDot);
  on('help-new', (req) => {
    toast('🚨 طلب مساعدة جديد داخل القروب — اضغط للعرض', 'help', 9000, () => { location.hash = '#/help'; });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    void req;
  });
  on('reconnected', () => { if (appBooted) { loadMembers().catch(() => {}); updateHelpDot(); route(); } });
  on('resume', () => { if (appBooted) { loadMe().then((me) => { if (me?.status !== 'active') gate(); }).catch(() => {}); } });

  window.addEventListener('hashchange', () => {
    if (appBooted) route();
    else if (!state.session && currentPath().path === 'join') gate();
  });
  await gate();
}

if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.NR_FORCE_PREVIEW) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  // فتح الصفحة المناسبة عند الضغط على إشعار والتطبيق مفتوح
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'nr-nav' && e.data.url) location.hash = e.data.url; });
}
start();
