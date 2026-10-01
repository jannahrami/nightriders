// طلب مساعدة جديد
import { h, mount, icon, topbar, toast, errMsg, HELP_KIND } from '../ui.js';
import { state, must } from '../core.js';
import { getPosition } from '../geo.js';

const KIND_ICON = { flat_tire: 'tire', breakdown: 'wrench', fuel: 'fuel', other: 'help' };

export default async function helpNew(root) {
  let kind = null, pos = null;
  const kinds = h('div', { class: 'picker-row', style: { gridTemplateColumns: 'repeat(2, 1fr)' } });
  const drawKinds = () => kinds.replaceChildren(...Object.entries(HELP_KIND).map(([k, t]) =>
    h('button', { type: 'button', class: 'pick' + (kind === k ? ' on' : ''), style: { minHeight: '64px', fontSize: '17px' }, onclick: () => { kind = k; drawKinds(); } }, icon(KIND_ICON[k]), t)));
  drawKinds();
  const desc = h('textarea', { class: 'textarea', maxlength: 500, placeholder: 'وين أنت؟ وش المشكلة؟ (اختياري)' });
  const locAgree = h('input', { type: 'checkbox' });
  const locStatus = h('div', { class: 'xs muted' }, 'لن يُرفق موقعك إلا إذا وافقت.');
  locAgree.onchange = async () => {
    pos = null;
    if (!locAgree.checked) { locStatus.textContent = 'لن يُرفق موقعك.'; locStatus.className = 'xs muted'; return; }
    locStatus.textContent = 'جارٍ تحديد موقعك…'; locStatus.className = 'xs muted';
    try {
      const p = await getPosition({ maximumAge: 0 });
      pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      locStatus.textContent = `تم تحديد الموقع (دقة ±${Math.round(pos.acc)} م)`; locStatus.className = 'form-ok';
    } catch (e) { locAgree.checked = false; locStatus.textContent = e.message; locStatus.className = 'form-error'; }
  };
  const err = h('div', { class: 'form-error', hidden: true });
  const send = h('button', { class: 'sos-btn', type: 'button' }, icon('help'), 'أرسل طلب المساعدة');
  send.onclick = async () => {
    if (send.disabled) return;
    err.hidden = true;
    if (!kind) { err.textContent = 'اختر نوع المشكلة.'; err.hidden = false; return; }
    if (locAgree.checked && !pos) { err.textContent = 'انتظر حتى يتحدد الموقع، أو ألغِ إرفاقه.'; err.hidden = false; return; }
    send.disabled = true; send.lastChild.textContent = 'جارٍ الإرسال…';
    try {
      await must(state.sb.from('help_requests').insert({ kind, description: desc.value.trim() || null,
        lat: pos?.lat ?? null, lng: pos?.lng ?? null, location_accuracy_m: pos?.acc ?? null }).select('id').single());
      toast('تم نشر طلبك داخل التطبيق', 'ok', 4000);
      location.hash = '#/help';
    } catch (e) {
      err.textContent = /duplicate|help_one_open/.test(String(e.message)) ? 'لديك طلب مساعدة مفتوح بالفعل. تجده في صفحة طلبات المساعدة.' : errMsg(e);
      err.hidden = false; send.disabled = false; send.lastChild.textContent = 'أرسل طلب المساعدة';
    }
  };

  mount(root, topbar({ title: 'أحتاج مساعدة', back: '#/home' }), h('div', { class: 'content stack-lg' },
    h('div', { class: 'notice danger' }, icon('info'), h('div', null,
      h('b', null, 'في الحوادث أو الخطر اتصل بالطوارئ فورًا.'), ' هذه الميزة للتواصل داخل القروب فقط ولا تغني عن خدمات الطوارئ.',
      h('div', { class: 'btn-row', style: { marginTop: '10px' } },
        h('a', { class: 'btn sm danger', href: 'tel:911' }, icon('phone'), '911 الطوارئ'),
        h('a', { class: 'btn sm danger-soft', href: 'tel:997' }, icon('phone'), '997 الإسعاف')))),
    h('div', { class: 'field' }, h('label', null, 'نوع المشكلة'), kinds),
    h('div', { class: 'field' }, h('label', null, 'وصف مختصر'), desc),
    h('label', { class: 'check' }, locAgree, h('span', null, 'أرفق موقعي الحالي مع الطلب', h('br'), locStatus)),
    err, send,
    h('div', { class: 'xs muted', style: { textAlign: 'center' } },
      'يوصل إشعار فوري لجوالات البنات اللي مفعّلين الإشعارات، ويظهر طلبك في التطبيق للكل. وللاحتياط اتصل بأقرب واحد منهم.')));
}
