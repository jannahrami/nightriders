// تفاصيل إعلان في السوق
import { h, mount, icon, topbar, chip, loadingView, errorView, emptyView, fmtRelative, fmtDateShort, confirmDialog, toast, errMsg, actionBtn, MARKET_CAT, CONDITION, fmtPrice } from '../ui.js';
import { state, must, myId, isAdmin, member, memberName } from '../core.js';
import { avatar, signedUrl, removeFiles } from '../media.js';

export default async function listingPage(root, [id]) {
  const body = h('div', { class: 'content stack-lg' }, loadingView());
  mount(root, topbar({ title: 'الإعلان', back: '#/market' }), body);

  async function load() {
    let r, contact = null;
    try {
      r = await must(state.sb.from('listings').select('*').eq('id', id).maybeSingle());
      if (!r) { mount(body, emptyView('tag', 'الإعلان غير موجود', 'ممكن انحذف أو انتهت مدته.', h('a', { class: 'btn', href: '#/market' }, 'رجوع للسوق'))); return; }
      if (r.user_id !== myId()) {
        const { data } = await state.sb.from('member_contacts').select('phone,show_phone').eq('user_id', r.user_id).maybeSingle();
        contact = data;
      }
    } catch (e) { mount(body, errorView(e, load)); return; }

    const own = r.user_id === myId();
    const expired = new Date(r.expires_at) <= new Date();
    const daysLeft = Math.ceil((new Date(r.expires_at) - Date.now()) / 864e5);
    const seller = member(r.user_id);

    // الصور
    const gallery = h('div', { class: 'mk-gallery' });
    const dots = h('div', { class: 'mk-dots' });
    if (r.photos?.length) {
      r.photos.forEach((p, i) => {
        const slide = h('div', { class: 'mk-slide' }, h('div', { class: 'spinner sm' }));
        signedUrl(p).then((u) => slide.replaceChildren(u ? h('img', { src: u, alt: `صورة ${i + 1}`, onclick: () => window.open(u, '_blank') }) : h('div', { class: 'muted small' }, 'تعذّر تحميل الصورة')));
        gallery.appendChild(slide);
        dots.appendChild(h('span', { class: i === 0 ? 'on' : '' }));
      });
      gallery.addEventListener('scroll', () => {
        const i = Math.round(Math.abs(gallery.scrollLeft) / gallery.clientWidth);
        [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
      }, { passive: true });
    }

    // التواصل
    const phone = contact?.phone;
    const wa = phone ? phone.replace(/[^\d]/g, '').replace(/^0/, '966') : null;
    const waText = encodeURIComponent(`السلام عليكم، بخصوص إعلانك في Jeddah Ride: ${r.title}`);
    const contactCard = own ? null : h('div', { class: 'card stack' },
      h('a', { class: 'row', href: `#/member/${r.user_id}`, style: { color: 'inherit' } }, avatar(seller),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, memberName(r.user_id)), h('div', { class: 'xs muted' }, 'البائع — اضغط لعرض ملفه'))),
      phone ? h('div', { class: 'btn-row' },
        h('a', { class: 'btn primary', href: `https://wa.me/${wa}?text=${waText}`, target: '_blank', rel: 'noopener' }, icon('chat'), 'واتساب'),
        h('a', { class: 'btn', href: `tel:${phone.replace(/\s/g, '')}` }, icon('phone'), 'اتصال'))
        : h('div', { class: 'small muted' }, 'البائع ما أظهر رقمه. كلّمه في الشات أو اطلب منه يضيف رقمه من «تعديل الملف».'));

    // أدوات صاحب الإعلان والأدمن
    const setStatus = async (status) => {
      const d = await must(state.sb.from('listings').update({ status }).eq('id', r.id).select('id'));
      if (!d.length) throw new Error('not_allowed');
      toast(status === 'sold' ? 'تم تعليمه كمباع' : 'رجع الإعلان نشط', 'ok'); load();
    };
    const del = async () => {
      if (!(await confirmDialog(own ? 'حذف إعلانك نهائيًا؟' : 'حذف هذا الإعلان كأدمن؟', { danger: true, ok: 'حذف' }))) return;
      const d = await must(state.sb.from('listings').delete().eq('id', r.id).select('id'));
      if (!d.length) throw new Error('not_allowed');
      removeFiles(r.photos || []).catch(() => {});
      toast('تم حذف الإعلان', 'ok'); location.hash = '#/market';
    };
    const tools = (own || isAdmin()) ? h('div', { class: 'card stack' },
      own ? h('div', { class: 'small muted' }, expired ? 'الإعلان منتهي ومخفي عن الأعضاء. جدّده ليرجع يظهر.' : `يظهر للأعضاء لمدة ${daysLeft} يوم باقي.`) : null,
      own ? h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `#/market/${r.id}/edit` }, icon('edit'), 'تعديل'),
        r.status === 'active' ? actionBtn('تم البيع', '', () => setStatus('sold'), 'check') : actionBtn('رجّعه نشط', '', () => setStatus('active'), 'refresh')) : null,
      own && (expired || daysLeft <= 7) ? actionBtn('جدّد 30 يوم', 'primary block', async () => {
        await must(state.sb.rpc('renew_listing', { p_listing: r.id })); toast('تم التجديد 30 يوم', 'ok'); load();
      }, 'refresh') : null,
      actionBtn(own ? 'حذف الإعلان' : 'حذف (أدمن)', 'danger-soft block', del, 'trash')) : null;

    mount(body,
      r.photos?.length ? h('div', { class: 'mk-gallery-wrap' }, gallery, r.photos.length > 1 ? dots : null) : null,
      h('div', { class: 'stack', style: { gap: '8px' } },
        h('div', { class: 'row wrap', style: { gap: '6px' } },
          r.status === 'sold' ? chip('مباع', 'red') : expired ? chip('منتهي', 'amber') : chip('متاح', 'green'),
          chip(MARKET_CAT[r.category], 'blue'), chip(CONDITION[r.condition]), r.city ? chip(r.city, '', 'pin') : null),
        h('div', { class: 'h1' }, r.title),
        h('div', { class: 'mk-price lg' }, fmtPrice(r.price)),
        h('div', { class: 'xs muted' }, `نُشر ${fmtRelative(r.created_at)} · ${fmtDateShort(r.created_at)}`)),
      r.description ? h('div', { class: 'card', style: { whiteSpace: 'pre-wrap', lineHeight: 1.7 } }, r.description) : null,
      contactCard,
      tools,
      h('div', { class: 'notice' }, icon('info'), h('div', null, 'التطبيق يعرض الإعلان فقط ولا يضمن البيع. عاين القطعة وتأكد من الأوراق قبل ما تحوّل أي مبلغ.')));
  }
  load();
}
