// أدوات الواجهة: إنشاء العناصر بأمان، الأيقونات، التنبيهات، النوافذ، التنسيق
export const TZ = 'Asia/Riyadh';

/** إنشاء عنصر DOM. النصوص تُضاف كنص فقط (لا innerHTML لبيانات المستخدم). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'multiple') el[k] = !!v;
      else if (k === 'ref' && typeof v === 'function') v(el);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...children) { clear(el); append(el, children); return el; }

// ---------- أيقونات (SVG ثابتة) ----------
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  help: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.2"/>',
  back: '<path d="m9 5 7 7-7 7"/>',
  fwd: '<path d="m15 5-7 7 7 7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.2c2.4.2 4 1.7 4.9 4.6"/>',
  fuel: '<path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M3 20h12M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 8h4"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  send: '<path d="M20 4 3 11l7 2.5L12.5 21z"/><path d="m10 13.5 4-4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-4 4 3 3-2 6 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  nav: '<path d="M12 2 5 21l7-4 7 4z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
  logout: '<path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h10"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  album: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  vote: '<path d="M4 20h16M6 20V10h3v10M11 20V5h3v15M16 20v-7h3v7"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  refresh: '<path d="M20 5v5h-5M4 19v-5h5"/><path d="M5.5 9A7 7 0 0 1 19 10M18.5 15A7 7 0 0 1 5 14"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9h5l4.5 7.5M11 9l-1-3H7.5M14 9l2-3h2"/>',
  wifioff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.6M19 13a10 10 0 0 0-3-2M2 9.5a15 15 0 0 1 5-3M22 9.5a15 15 0 0 0-10-4"/><circle cx="12" cy="20" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.2 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
};
export function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('width', '20');
  s.setAttribute('height', '20');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = P[name] || P.dot; // مسارات ثابتة من الكود فقط
  return s;
}

// ---------- تنبيهات ----------
export function toast(msg, type = '', ms = 3200, onClick) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + type, role: type === 'err' ? 'alert' : 'status' },
    type === 'ok' ? icon('check') : type === 'err' ? icon('info') : type === 'help' ? icon('help') : null, h('span', null, msg));
  if (onClick) t.addEventListener('click', () => { onClick(); t.remove(); });
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- نوافذ سفلية ----------
export function openSheet(title, build, onClose) {
  const back = h('div', { class: 'sheet-backdrop' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    back.remove(); document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  sheet.append(h('div', { class: 'grab' }), title ? h('div', { class: 'sheet-title' }, title) : null);
  const body = build(close);
  if (body) sheet.append(body);
  back.appendChild(sheet);
  document.body.appendChild(back);
  return close;
}

export function confirmDialog(message, { ok = 'تأكيد', danger = false, cancel = 'إلغاء' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const answer = (v, close) => { if (done) return; done = true; resolve(v); close(); };
    openSheet(null, (close) => h('div', { class: 'stack' },
      h('p', { class: 'h3', style: { margin: '4px 0 8px', lineHeight: '1.6' } }, message),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => answer(true, close) }, ok),
        h('button', { class: 'btn', onclick: () => answer(false, close) }, cancel))),
      () => { if (!done) { done = true; resolve(false); } });
  });
}

// ---------- حالات العرض ----------
export const loadingView = (text = 'جارٍ التحميل…') => h('div', { class: 'loading' }, h('div', { class: 'spinner sm' }), text);
export function emptyView(ic, title, text, action) {
  return h('div', { class: 'empty' }, icon(ic), h('div', { class: 'h3' }, title), text ? h('div', { class: 'small' }, text) : null, action || null);
}
export function errorView(err, retry) {
  return h('div', { class: 'error-box card' },
    h('div', { class: 'h3' }, 'تعذّر تحميل البيانات'),
    h('div', { class: 'small muted' }, errMsg(err)),
    retry ? h('button', { class: 'btn sm', onclick: retry }, icon('refresh'), 'إعادة المحاولة') : null);
}

/** زر ينفّذ عملية غير متزامنة ويمنع الضغط المزدوج */
export function actionBtn(label, cls, fn, ic) {
  const b = h('button', { class: 'btn ' + (cls || ''), type: 'button' }, ic ? icon(ic) : null, h('span', null, label));
  b.addEventListener('click', async () => {
    if (b.classList.contains('busy')) return;
    b.classList.add('busy');
    const sp = h('div', { class: 'spinner sm' });
    b.prepend(sp);
    try { await fn(b); } catch (e) { toast(errMsg(e), 'err', 4500); }
    finally { sp.remove(); b.classList.remove('busy'); }
  });
  return b;
}

// ---------- رسائل الأخطاء ----------
const ERR = {
  invalid_invite: 'كود الدعوة غير صحيح أو منتهي الصلاحية.',
  account_suspended: 'تم إيقاف هذا الحساب. تواصل مع الأدمن.',
  not_authenticated: 'يجب تسجيل الدخول أولًا.',
  admin_only: 'هذه العملية للأدمن فقط.',
  owner_only: 'هذه العملية للأدمن الأساسي فقط.',
  members_only: 'هذه العملية للأعضاء المقبولين فقط.',
  cannot_suspend_owner: 'لا يمكن إيقاف الأدمن الأساسي.',
  cannot_suspend_self: 'لا يمكنك إيقاف نفسك.',
  cannot_change_self: 'لا يمكنك تغيير دورك بنفسك.',
  member_not_found: 'العضو غير موجود أو حالته لا تسمح بهذه العملية.',
  invalid_duration: 'مدة غير صالحة.',
  ride_not_found: 'الطلعة غير موجودة.',
  ride_closed: 'الطلعة منتهية أو ملغاة.',
  not_going: 'أكّد مشاركتك أولًا لتحديث حالتك.',
  ride_managers_only: 'هذا متاح لمنظّم الطلعة والأدمن فقط.',
  poll_closed: 'التصويت مغلق.',
  poll_not_found: 'التصويت غير موجود.',
  poll_needs_2_to_8_options: 'التصويت يحتاج من 2 إلى 8 خيارات.',
  closes_at_past: 'وقت إغلاق التصويت يجب أن يكون في المستقبل.',
  share_too_long: 'أقصى مدة لمشاركة الموقع 12 ساعة.',
  share_until_past: 'مدة المشاركة انتهت.',
  ready_too_long: 'أقصى مدة لـ«جاهز أطلع» 12 ساعة.',
  organizer_not_allowed: 'لا يمكنك تعيين منظّم آخر. هذا للأدمن فقط.',
  organizer_not_active: 'المنظّم يجب أن يكون عضوًا فعّالًا.',
  leader_must_be_participant: 'قائد الطلعة يجب أن يكون من المشاركين المؤكدين.',
  sweep_must_be_participant: 'آخر الركب يجب أن يكون من المشاركين المؤكدين.',
  not_allowed: 'غير مسموح لك بهذه العملية.',
  help_one_open_per_user: 'لديك طلب مساعدة مفتوح بالفعل.',
  listing_limit: 'وصلت الحد: 5 إعلانات نشطة. علّم إعلانًا كمباع أو احذفه أولًا.',
  invalid_photo_path: 'صور الإعلان غير صالحة. أعد اختيارها.',
};
export function errMsg(e) {
  if (!e) return 'حدث خطأ غير متوقع.';
  const m = String(e.message || e.error_description || e.msg || e);
  for (const k of Object.keys(ERR)) if (m.includes(k)) return ERR[k];
  if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return 'ليست لديك صلاحية لهذه العملية.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.';
  if (/Invalid login credentials/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة.';
  if (/Email not confirmed/i.test(m)) return 'البريد لم يُؤكَّد بعد. افتح رسالة التأكيد في بريدك.';
  if (/User already registered|already been registered/i.test(m)) return 'هذا البريد مسجّل مسبقًا. سجّل الدخول بدلًا من ذلك.';
  if (/Password should be at least/i.test(m)) return 'كلمة المرور قصيرة (6 أحرف على الأقل).';
  if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة. انتظر قليلًا ثم حاول.';
  if (/JWT|token/i.test(m) && /expired/i.test(m)) return 'انتهت الجلسة. سجّل الدخول مجددًا.';
  if (/check constraint|violates/i.test(m)) return 'بعض البيانات غير صالحة. راجع الحقول.';
  if (/Payload too large|exceeded the maximum allowed size|too large/i.test(m)) return 'الملف أكبر من الحد المسموح.';
  if (/mime type|not supported/i.test(m)) return 'نوع الملف غير مدعوم.';
  return 'حدث خطأ: ' + m.slice(0, 140);
}

// ---------- التواريخ (العرض بتوقيت السعودية دائمًا) ----------
const LOC = 'ar-SA-u-ca-gregory-nu-latn';
const fDate = new Intl.DateTimeFormat(LOC, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fDateShort = new Intl.DateTimeFormat(LOC, { timeZone: TZ, day: 'numeric', month: 'short' });
const fTime = new Intl.DateTimeFormat(LOC, { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const fDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const fmtDate = (d) => d ? fDate.format(new Date(d)) : '—';
export const fmtDateShort = (d) => d ? fDateShort.format(new Date(d)) : '—';
export const fmtTime = (d) => d ? fTime.format(new Date(d)) : '—';
export const fmtDateTime = (d) => d ? `${fmtDate(d)} · ${fmtTime(d)}` : '—';
export const dayKey = (d) => fDayKey.format(new Date(d));
export function fmtRelative(d) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const fut = s < 0; const a = Math.abs(s);
  let t;
  if (a < 45) return fut ? 'خلال لحظات' : 'الآن';
  if (a < 3600) { const m = Math.round(a / 60); t = m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`; }
  else if (a < 86400) { const hr = Math.round(a / 3600); t = hr === 1 ? 'ساعة' : hr === 2 ? 'ساعتين' : hr <= 10 ? `${hr} ساعات` : `${hr} ساعة`; }
  else { const dd = Math.round(a / 86400); t = dd === 1 ? 'يوم' : dd === 2 ? 'يومين' : dd <= 10 ? `${dd} أيام` : `${dd} يومًا`; }
  return fut ? `بعد ${t}` : `قبل ${t}`;
}
export function fmtRemaining(until) {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'انتهت';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} د`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} س ${mm} د` : `${hh} س`;
}
/** قيمة حقل datetime-local بتوقيت السعودية (UTC+3 بلا توقيت صيفي) */
export function toRiyadhInput(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
export function fromRiyadhInput(val) {
  if (!val) return null;
  const d = new Date(val + ':00+03:00');
  return isNaN(d) ? null : d.toISOString();
}
export function fmtKm(km) { return km == null ? null : `${Number(km).toLocaleString('en-US', { maximumFractionDigits: 1 })} كم`; }

export const RIDE_STATUS = {
  planned: { t: 'مخطط لها', c: 'blue' },
  ongoing: { t: 'جارية', c: 'green live' },
  completed: { t: 'مكتملة', c: '' },
  cancelled: { t: 'ملغاة', c: 'red' },
};
export const RSVP = { going: 'مشارك', maybe: 'يمكن', declined: 'معتذر' };
export const PROGRESS = { on_way: 'في الطريق', arrived: 'وصلت التجمع', returned: 'رجعت بالسلامة' };
export const STYLE = { calm: 'هادي', touring: 'سياحي', long_distance: 'مسافات طويلة' };
export const HELP_KIND = { flat_tire: 'بنشر', breakdown: 'عطل', fuel: 'نفاد بنزين', other: 'أخرى' };
export const MARKET_CAT = { bike: 'دباب', parts: 'قطع', gear: 'خوذ وملابس', accessories: 'إكسسوارات', other: 'أخرى' };
export const CONDITION = { new: 'جديد', used: 'مستعمل' };
export function fmtPrice(p) { return p == null ? 'على السوم' : `${Number(p).toLocaleString('en-US')} ريال`; }
export const STOP_KIND = { fuel: 'محطة بنزين', rest: 'استراحة', other: 'نقطة' };

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** روابط فتح موقع في تطبيقات الخرائط */
export function openInMaps(lat, lng, label) {
  openSheet('فتح في تطبيق الخرائط', (close) => h('div', { class: 'stack' },
    label ? h('div', { class: 'muted small' }, label) : null,
    h('a', { class: 'btn block', href: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, target: '_blank', rel: 'noopener', onclick: close }, 'Apple Maps'),
    h('a', { class: 'btn block', href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, target: '_blank', rel: 'noopener', onclick: close }, 'Google Maps'),
    h('a', { class: 'btn block', href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, target: '_blank', rel: 'noopener', onclick: close }, 'Waze'),
    h('button', { class: 'btn ghost block', onclick: close }, 'إلغاء')));
}

export function topbar({ title, back, actions } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': 'رجوع', onclick: () => (history.length > 1 ? history.back() : (location.hash = back)) }, icon('back')) : null,
    title ? h('h1', { class: 'title' }, title)
          : h('div', { class: 'logo' }, h('div', { class: 'brand-mark', 'aria-hidden': 'true' }), h('div', { class: 'brand-word' }, 'Jeddah ', h('b', null, 'Ride'))),
    actions || null);
}

export function chip(text, cls, ic) { return h('span', { class: 'chip ' + (cls || '') }, ic ? icon(ic) : null, text); }

/** يجعل العنصر يملأ المساحة المتبقية من الشاشة (يتكيف مع الشريط العلوي ولوحة المفاتيح) */
export function fitToViewport(el) {
  const fit = () => {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    el.style.height = Math.max(320, vh - top) + 'px';
  };
  requestAnimationFrame(fit);
  const t = setTimeout(fit, 300);
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  const obs = new MutationObserver(fit);
  ['net-banner', 'preview-banner'].forEach((id) => { const b = document.getElementById(id); if (b) obs.observe(b, { attributes: true }); });
  return () => { clearTimeout(t); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); obs.disconnect(); };
}
