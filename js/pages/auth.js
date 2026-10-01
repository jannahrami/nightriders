// شاشات ما قبل الدخول: الإعداد، الدخول/التسجيل بالدعوة، الانتظار، الإيقاف
import { h, mount, icon, errMsg, openSheet, toast } from '../ui.js';
import { state, brand as brandCfg, must } from '../core.js';
import { pushStatus, enablePush, detachPush, PUSH_ERR } from '../push.js';

const JOIN_KEY = 'nr.pendingJoin';
const brand = (sub) => h('div', { class: 'auth-head' },
  h('img', { class: 'brand-logo', src: 'assets/img/logo-full.png', alt: brandCfg().name }),
  sub ? h('p', null, sub) : null);

export function centerCard(title, text, ...actions) {
  return h('div', { class: 'auth-wrap' }, brand(),
    h('div', { class: 'card pad-lg stack' }, h('div', { class: 'h2' }, title), text ? h('p', { class: 'muted', style: { margin: 0 } }, text) : null, ...actions));
}

const field = (label, input, hint) => h('div', { class: 'field' }, h('label', null, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
const redirectUrl = () => location.origin + location.pathname;

// ---------- شاشة الإعداد ----------
export function renderSetup(root, problem) {
  const msg = problem === 'service_role'
    ? 'تم وضع مفتاح service_role في الإعدادات. هذا مفتاح سري يتجاوز كل الصلاحيات ويجب ألا يوضع في الواجهة أبدًا. استبدله بالمفتاح العام (anon) فورًا، ثم غيّر مفتاح service_role من لوحة Supabase.'
    : 'لم يتم ربط التطبيق بمشروع Supabase بعد.';
  mount(root, h('div', { class: 'auth-wrap' }, brand('إعداد التطبيق'),
    h('div', { class: 'card pad-lg stack' },
      h('div', { class: problem === 'service_role' ? 'notice danger' : 'notice warn' }, icon('info'), h('div', null, msg)),
      h('ol', { class: 'small', style: { margin: 0, paddingInlineStart: '20px', lineHeight: 1.9 } },
        h('li', null, 'انسخ الملف ', h('b', { class: 'ltr' }, 'config.example.js'), ' باسم ', h('b', { class: 'ltr' }, 'config.js')),
        h('li', null, 'ضع فيه عنوان المشروع والمفتاح العام (anon) من Supabase ← Project Settings ← API'),
        h('li', null, 'نفّذ ملف ', h('b', { class: 'ltr' }, 'supabase/schema.sql'), ' في SQL Editor'),
        h('li', null, 'أعد تحميل الصفحة')),
      problem === 'service_role' ? null : h('div', { class: 'divider' }),
      problem === 'service_role' ? null : h('a', { class: 'btn block', href: '?preview=1#/home' }, 'معاينة الواجهة ببيانات تجريبية'),
      problem === 'service_role' ? null : h('div', { class: 'xs muted' }, 'وضع المعاينة منفصل تمامًا، بياناته وهمية وتختفي عند إعادة التحميل.'))));
}

// ---------- الدخول والتسجيل ----------
export function renderAuth(root, { code } = {}) {
  let mode = code ? 'signup' : 'login';
  const box = h('div', { class: 'card pad-lg' });
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const draw = () => {
    mount(tabs,
      h('button', { class: mode === 'login' ? 'on' : '', role: 'tab', onclick: () => { mode = 'login'; draw(); } }, 'تسجيل الدخول'),
      h('button', { class: mode === 'signup' ? 'on' : '', role: 'tab', onclick: () => { mode = 'signup'; draw(); } }, 'حساب جديد'));
    mount(box, mode === 'login' ? loginForm() : signupForm(code));
  };
  draw();
  mount(root, h('div', { class: 'auth-wrap' }, brand('سجّل وانضم لطلعات القروب'), tabs, box));
}

function loginForm() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, dir: 'ltr' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, dir: 'ltr' });
  const err = h('div', { class: 'form-error', hidden: true });
  const btn = h('button', { class: 'btn primary block lg', type: 'submit' }, 'دخول');
  const form = h('form', { class: 'stack', novalidate: true }, field('البريد الإلكتروني', email), field('كلمة المرور', pass), err, btn,
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => forgot(email.value) }, 'نسيت كلمة المرور؟'));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (btn.classList.contains('busy')) return;
    err.hidden = true; btn.classList.add('busy'); btn.textContent = 'جارٍ الدخول…';
    const { error } = await state.sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    btn.classList.remove('busy'); btn.textContent = 'دخول';
    if (error) { err.textContent = errMsg(error); err.hidden = false; }
  };
  return form;
}

function signupForm(prefill) {
  const name = h('input', { class: 'input', maxlength: 40, autocomplete: 'nickname', placeholder: 'مثال: أبو فهد' });
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', dir: 'ltr' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', dir: 'ltr', minlength: 8 });
  const bike = h('input', { class: 'input', maxlength: 40, placeholder: 'مثال: Suzuki GSX-S750' });
  const code = h('input', { class: 'input code', maxlength: 10, autocomplete: 'off', autocapitalize: 'characters', value: prefill || '', placeholder: 'XXXXXXXXXX' });
  const codeField = field('كود الدعوة', code);
  codeField.hidden = !prefill;
  const showCode = h('button', { class: 'btn ghost sm', type: 'button', hidden: !!prefill, onclick: () => { codeField.hidden = false; showCode.hidden = true; code.focus(); } }, 'عندي كود دعوة');
  const err = h('div', { class: 'form-error', hidden: true });
  const btn = h('button', { class: 'btn primary block lg', type: 'submit' }, 'سجّل');
  const form = h('form', { class: 'stack', novalidate: true },
    field('اسمك', name), field('البريد الإلكتروني', email), field('كلمة المرور', pass, '8 أحرف على الأقل'),
    field('دبابك (اختياري)', bike), codeField, showCode, err, btn,
    h('div', { class: 'xs muted' }, 'بعد التسجيل تدخل التطبيق على طول.'));
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (btn.classList.contains('busy')) return;
    err.hidden = true;
    const n = name.value.trim(), c = code.value.trim().toUpperCase();
    if (n.length < 2) return fail('اكتب اسمك (حرفان على الأقل).');
    if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return fail('اكتب بريد إلكتروني صحيح.');
    if (pass.value.length < 8) return fail('كلمة المرور 8 أحرف على الأقل.');
    if (c && !/^[A-Z0-9]{10}$/.test(c)) return fail('كود الدعوة يتكون من 10 رموز، أو اتركه فاضي.');
    btn.classList.add('busy'); btn.textContent = 'جارٍ التسجيل…';
    try {
      if (c) {
        const valid = await must(state.sb.rpc('check_invite', { p_code: c }));
        if (!valid) throw new Error('invalid_invite');
      }
      localStorage.setItem(JOIN_KEY, JSON.stringify({ code: c || null, name: n, bike: bike.value.trim() || null }));
      const { data, error } = await state.sb.auth.signUp({ email: email.value.trim(), password: pass.value,
        options: { emailRedirectTo: redirectUrl(), data: { display_name: n } } });
      if (error) throw error;
      if (!data.session) {
        mount(form.parentElement, h('div', { class: 'stack' },
          h('div', { class: 'form-ok' }, 'تم التسجيل ✅ افتح رسالة التأكيد في بريدك، وبعدها ارجع وسجّل دخول.'),
          h('div', { class: 'xs muted' }, 'ما وصلتك الرسالة؟ شيك مجلد Spam. وإذا كان البريد مسجل من قبل، استخدم «تسجيل الدخول».')));
      }
      // إذا رجعت جلسة مباشرة، البوابة تكمل طلب الانضمام تلقائيًا
    } catch (ex) { fail(errMsg(ex)); }
    finally { btn.classList.remove('busy'); btn.textContent = 'سجّل'; }
  };
  return form;
}

function forgot(prefill) {
  openSheet('استعادة كلمة المرور', (close) => {
    const email = h('input', { class: 'input', type: 'email', dir: 'ltr', value: prefill || '' });
    const msg = h('div', { hidden: true });
    const btn = h('button', { class: 'btn primary block' }, 'إرسال رابط الاستعادة');
    btn.onclick = async () => {
      if (btn.classList.contains('busy')) return;
      btn.classList.add('busy');
      const { error } = await state.sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: redirectUrl() });
      btn.classList.remove('busy');
      msg.hidden = false;
      msg.className = error ? 'form-error' : 'form-ok';
      msg.textContent = error ? errMsg(error) : 'إذا كان البريد مسجلًا ستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة.';
    };
    return h('div', { class: 'stack' }, field('البريد الإلكتروني', email), msg, btn, h('button', { class: 'btn ghost block', onclick: close }, 'إغلاق'));
  });
}

export function openNewPassword() {
  openSheet('تعيين كلمة مرور جديدة', (close) => {
    const pass = h('input', { class: 'input', type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    const msg = h('div', { class: 'form-error', hidden: true });
    const btn = h('button', { class: 'btn primary block' }, 'حفظ كلمة المرور');
    btn.onclick = async () => {
      if (pass.value.length < 8) { msg.textContent = '8 أحرف على الأقل.'; msg.hidden = false; return; }
      btn.classList.add('busy');
      const { error } = await state.sb.auth.updateUser({ password: pass.value });
      btn.classList.remove('busy');
      if (error) { msg.textContent = errMsg(error); msg.hidden = false; return; }
      toast('تم تغيير كلمة المرور', 'ok'); close();
    };
    return h('div', { class: 'stack' }, field('كلمة المرور الجديدة', pass), msg, btn);
  });
}

// ---------- إكمال الانضمام بعد تسجيل الدخول ----------
export function renderJoin(root, { code, onDone }) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(JOIN_KEY) || 'null'); } catch { /* */ }
  const nameIn = h('input', { class: 'input', maxlength: 40, value: saved?.name || state.session?.user?.user_metadata?.display_name || '' });
  const bikeIn = h('input', { class: 'input', maxlength: 40, value: saved?.bike || '', placeholder: 'اختياري' });
  const codeIn = h('input', { class: 'input code', maxlength: 10, value: code || saved?.code || '', autocapitalize: 'characters', placeholder: 'اختياري' });
  const err = h('div', { class: 'form-error', hidden: true });
  const btn = h('button', { class: 'btn primary block lg', type: 'submit' }, 'أرسل طلب الانضمام');
  codeIn.addEventListener('input', () => { btn.textContent = codeIn.value.trim() ? 'ادخل' : 'أرسل طلب الانضمام'; });
  if (codeIn.value.trim()) btn.textContent = 'ادخل';
  const submit = async () => {
    if (btn.classList.contains('busy')) return;
    err.hidden = true;
    const n = nameIn.value.trim(), c = codeIn.value.trim().toUpperCase();
    if (n.length < 2) { err.textContent = 'اكتب اسمك (حرفان على الأقل).'; err.hidden = false; return; }
    btn.classList.add('busy');
    try {
      if (c) await must(state.sb.rpc('redeem_invite', { p_code: c, p_display_name: n }));
      else await must(state.sb.rpc('request_join', { p_display_name: n, p_bike_type: bikeIn.value.trim() || null }));
      localStorage.removeItem(JOIN_KEY);
      onDone();
    } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
    finally { btn.classList.remove('busy'); }
  };
  const form = h('form', { class: 'card pad-lg stack', novalidate: true },
    h('div', { class: 'h2' }, 'آخر خطوة'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'أكّد اسمك وأرسل طلب الانضمام. الأدمن يراجع الطلب ويوصلك إشعار أول ما ينقبل. (لو معك كود دعوة تدخل على طول.)'),
    field('اسمك', nameIn), field('دبابك', bikeIn), field('كود الدعوة', codeIn), err, btn,
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => state.sb.auth.signOut() }, 'تسجيل الخروج'));
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  mount(root, h('div', { class: 'auth-wrap' }, brand(), form));
  if (saved && nameIn.value.trim().length >= 2) submit();   // إكمال تلقائي بعد التسجيل
}

export function renderPending(root, { onRefresh }) {
  const me = state.me;
  const refresh = h('button', { class: 'btn block' }, icon('refresh'), 'تحقق الآن');
  refresh.onclick = () => { refresh.classList.add('busy'); onRefresh(); };
  const notif = h('div');
  pushStatus().then((st) => {
    if (st === 'on') { mount(notif, h('div', { class: 'notice' }, icon('bell'), h('div', null, 'الإشعارات مفعّلة ✓ — بيوصلك إشعار أول ما ينقبل طلبك.'))); return; }
    if (st === 'off') {
      const b = h('button', { class: 'btn primary block' }, icon('bell'), 'فعّل الإشعارات عشان يوصلك خبر القبول');
      b.onclick = async () => {
        if (b.classList.contains('busy')) return;
        b.classList.add('busy');
        try { await enablePush(); toast('تم تفعيل الإشعارات 👍', 'ok'); mount(notif, h('div', { class: 'notice' }, icon('bell'), h('div', null, 'الإشعارات مفعّلة ✓ — بيوصلك إشعار أول ما ينقبل طلبك.'))); }
        catch (e) { toast(PUSH_ERR[e?.message] || errMsg(e), 'err', 7000); }
        finally { b.classList.remove('busy'); }
      };
      mount(notif, b); return;
    }
    if (PUSH_ERR[st] && st !== 'preview' && st !== 'no_key') mount(notif, h('div', { class: 'notice' }, icon('info'), h('div', null, PUSH_ERR[st])));
  });
  mount(root, centerCard('طلبك بانتظار الموافقة',
    `أهلًا ${me?.display_name || ''}. وصل طلب انضمامك للأدمن. لن يظهر محتوى القروب حتى تتم الموافقة.`,
    notif,
    h('div', { class: 'notice' }, icon('info'), h('div', null, 'إذا كانت الصفحة مفتوحة، ستنتقل تلقائيًا عند القبول. أو اضغط «تحقق الآن».')),
    refresh,
    h('button', { class: 'btn ghost block', onclick: async () => { await detachPush(); state.sb.auth.signOut(); } }, icon('logout'), 'تسجيل الخروج')));
}

export function renderSuspended(root) {
  mount(root, centerCard('الحساب موقوف',
    'تم إيقاف عضويتك في القروب، ولا يمكنك الاطلاع على المحتوى. للاستفسار تواصل مع الأدمن.',
    h('button', { class: 'btn block', onclick: () => state.sb.auth.signOut() }, icon('logout'), 'تسجيل الخروج')));
}
