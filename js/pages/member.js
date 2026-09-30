// ملف عضو
import { h, mount, icon, topbar, chip, STYLE, fmtRemaining, emptyView, loadingView } from '../ui.js';
import { state, member, isReady } from '../core.js';
import { avatar, privateImg } from '../media.js';

export default async function memberPage(root, [id]) {
  const body = h('div', { class: 'content stack-lg' }, loadingView());
  mount(root, topbar({ title: 'ملف العضو', back: '#/members' }), body);
  const p = member(id);
  if (!p) { mount(body, emptyView('user', 'العضو غير موجود أو غير متاح')); return; }
  let contact = null;
  try {
    const { data } = await state.sb.from('member_contacts').select('phone,show_phone').eq('user_id', id).maybeSingle();
    contact = data;
  } catch { /* الرقم اختياري */ }
  const phone = contact?.phone;
  const wa = phone ? phone.replace(/[^\d]/g, '').replace(/^0/, '966') : null;
  mount(body,
    h('div', { class: 'card hero stack', style: { alignItems: 'center', textAlign: 'center' } },
      avatar(p, 'lg'),
      h('div', { class: 'h1' }, p.display_name),
      h('div', { class: 'row wrap', style: { justifyContent: 'center', gap: '6px' } },
        p.status === 'suspended' ? chip('موقوف', 'red') : null,
        p.role === 'owner' ? chip('الأدمن الأساسي', 'violet', 'shield') : p.role === 'admin' ? chip('أدمن', 'violet', 'shield') : null,
        isReady(p) ? chip(`جاهز يطلع · باقي ${fmtRemaining(p.ready_until)}`, 'green live') : null,
        p.city ? chip(p.city, '', 'pin') : null)),
    h('div', { class: 'card stack' },
      h('div', { class: 'row' }, icon('bike'), h('div', { class: 'h3' }, 'الدباب')),
      p.bike_photo_path ? h('div', { class: 'bike-photo' }, privateImg(p.bike_photo_path)) : null,
      h('dl', { class: 'kv', style: { margin: 0 } },
        h('dt', null, 'النوع'), h('dd', null, p.bike_type || '—'),
        h('dt', null, 'الموديل'), h('dd', null, p.bike_model || '—'),
        h('dt', null, 'أسلوب الركوب'), h('dd', null, p.riding_style ? STYLE[p.riding_style] : '—'))),
    phone ? h('div', { class: 'card stack' },
      h('div', { class: 'row between' }, h('div', { class: 'h3' }, 'التواصل'), h('span', { class: 'ltr' }, phone)),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `tel:${phone.replace(/\s/g, '')}` }, icon('phone'), 'اتصال'),
        h('a', { class: 'btn', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener' }, icon('chat'), 'واتساب')))
      : h('div', { class: 'small muted', style: { textAlign: 'center' } }, 'لم يُظهر هذا العضو رقم تواصل.'));
}
