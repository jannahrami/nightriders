// حسابي: ملف البايكر، جاهز أطلع، مشاركة الموقع، التثبيت، لوحة الأدمن، الخروج
import { h, mount, icon, topbar, chip, STYLE, fmtRemaining, actionBtn, toast, isIOS, isStandalone, confirmDialog } from '../ui.js';
import { state, must, myId, isAdmin, isOwner, on, isReady } from '../core.js';
import { avatar, privateImg } from '../media.js';
import { sharing } from '../geo.js';
import { sharingCard } from '../share-ui.js';

export default async function profilePage(root) {
  const body = h('div', { class: 'content stack-lg' });
  mount(root, topbar({ title: 'حسابي', actions: h('a', { class: 'icon-btn', href: '#/me/edit', 'aria-label': 'تعديل الملف' }, icon('edit')) }), body);
  const share = sharingCard();

  function draw() {
    const me = state.me;
    const ready = isReady(me);
    const setReady = async (hours) => {
      const until = hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null;
      const rows = await must(state.sb.from('profiles').update({ ready_until: until }).eq('id', myId()).select('*'));
      if (!rows.length) throw new Error('not_allowed');
      state.me = rows[0]; state.members.set(rows[0].id, rows[0]);
      toast(hours ? 'تم تفعيل «جاهز أطلع»' : 'تم الإيقاف', 'ok', 1800); draw();
    };
    mount(body,
      h('div', { class: 'card hero stack', style: { alignItems: 'center', textAlign: 'center' } },
        avatar(me, 'lg'),
        h('div', { class: 'h1' }, me.display_name),
        h('div', { class: 'row wrap', style: { justifyContent: 'center', gap: '6px' } },
          isOwner() ? chip('الأدمن الأساسي', 'violet', 'shield') : isAdmin() ? chip('أدمن', 'violet', 'shield') : chip('عضو', 'blue'),
          me.city ? chip(me.city, '', 'pin') : null,
          me.riding_style ? chip(STYLE[me.riding_style], '') : null)),

      h('div', { class: 'card stack' },
        h('div', { class: 'row' }, icon('bike'), h('div', { class: 'h3' }, 'الدباب')),
        me.bike_photo_path ? h('div', { class: 'bike-photo' }, privateImg(me.bike_photo_path)) : null,
        h('dl', { class: 'kv', style: { margin: 0 } },
          h('dt', null, 'النوع'), h('dd', null, me.bike_type || '—'),
          h('dt', null, 'الموديل'), h('dd', null, me.bike_model || '—'),
          h('dt', null, 'أسلوب الركوب'), h('dd', null, me.riding_style ? STYLE[me.riding_style] : '—')),
        h('a', { class: 'btn block', href: '#/me/edit' }, icon('edit'), 'تعديل الملف')),

      h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('div', { class: 'row' }, icon('bolt'), h('div', { class: 'h3' }, 'جاهز أطلع')),
          ready ? chip(`باقي ${fmtRemaining(me.ready_until)}`, 'green live') : chip('غير مفعّل')),
        ready ? actionBtn('إيقاف', 'danger-soft block', () => setReady(null), 'stop')
          : h('div', { class: 'btn-row' }, actionBtn('ساعة', '', () => setReady(1)), actionBtn('ساعتين', '', () => setReady(2)), actionBtn('4 ساعات', '', () => setReady(4)))),

      h('div', { class: 'card' }, share),

      h('div', { class: 'card stack', style: { gap: '8px' } },
        h('a', { class: 'btn block', href: '#/members' }, icon('users'), 'أعضاء القروب'),
        h('a', { class: 'btn block', href: '#/help' }, icon('help'), 'طلبات المساعدة'),
        isAdmin() ? h('a', { class: 'btn primary block', href: '#/admin' }, icon('shield'), 'لوحة الأدمن') : null),

      !isStandalone() ? h('div', { class: 'notice' }, icon('info'), h('div', null,
        isIOS() ? 'لإضافة التطبيق للشاشة الرئيسية في iPhone: افتحه في Safari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية».'
                : 'يمكنك تثبيت التطبيق من قائمة المتصفح ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».')) : null,

      h('button', { class: 'btn ghost block', onclick: async () => {
        if (!(await confirmDialog('تسجيل الخروج من هذا الجهاز؟', { ok: 'خروج' }))) return;
        if (sharing.active) { try { await sharing.stop('user'); } catch { /* */ } }
        await state.sb.auth.signOut();
      } }, icon('logout'), 'تسجيل الخروج'),
      h('div', { class: 'xs muted', style: { textAlign: 'center' } }, h('span', { class: 'en' }, 'NightRiders v1.0')));
  }
  draw();
  const offs = [on('me', draw)];
  return () => { offs.forEach((f) => f()); share._cleanup(); };
}
