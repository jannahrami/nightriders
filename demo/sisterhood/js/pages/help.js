// طلبات المساعدة: المفتوحة والمحلولة مؤخرًا
import { h, mount, icon, topbar, chip, loadingView, errorView, emptyView, fmtRelative, openInMaps, actionBtn, confirmDialog, toast, HELP_KIND } from '../ui.js';
import { state, must, on, myId, member, isAdmin } from '../core.js';
import { avatar } from '../media.js';

export default async function helpPage(root) {
  const list = h('div', { class: 'stack' }, loadingView());
  mount(root, topbar({ title: 'طلبات المساعدة', back: '#/home' }), h('div', { class: 'content stack-lg' },
    h('a', { class: 'sos-btn', href: '#/help/new' }, icon('help'), 'أحتاج مساعدة'),
    h('a', { class: 'btn block', href: '#/places/repair' }, icon('wrench'), 'أقرب محل صيانة'),
    list));

  async function load() {
    try {
      const since = new Date(Date.now() - 3 * 864e5).toISOString();
      const reqs = await must(state.sb.from('help_requests').select('*').or(`status.eq.open,created_at.gte."${since}"`).order('created_at', { ascending: false }).limit(30));
      const ids = reqs.map((r) => r.id);
      const [responders, contacts] = await Promise.all([
        ids.length ? must(state.sb.from('help_responders').select('*').in('request_id', ids)) : [],
        reqs.length ? must(state.sb.from('member_contacts').select('user_id,phone').in('user_id', [...new Set(reqs.map((r) => r.user_id))])) : [],
      ]);
      if (!reqs.length) { mount(list, emptyView('check', 'لا توجد طلبات مساعدة', 'الحمد لله، الكل بخير.')); return; }
      const open = reqs.filter((r) => r.status === 'open'), done = reqs.filter((r) => r.status !== 'open');
      const card = (r) => {
        const p = member(r.user_id);
        const resp = responders.filter((x) => x.request_id === r.id);
        const iResponded = resp.some((x) => x.user_id === myId());
        const mine = r.user_id === myId();
        const phone = contacts.find((c) => c.user_id === r.user_id)?.phone;
        const canResolve = r.status === 'open' && (mine || isAdmin() || iResponded);
        return h('div', { class: 'card stack' + (r.status === 'open' ? ' help-card' : '') },
          h('div', { class: 'row between' },
            h('div', { class: 'person' }, avatar(p), h('div', null, h('div', { class: 'name' }, p?.display_name || 'عضو'), h('div', { class: 'xs muted' }, fmtRelative(r.created_at)))),
            r.status === 'open' ? chip(HELP_KIND[r.kind], 'red live') : chip(`تم الحل · ${HELP_KIND[r.kind]}`, 'green')),
          r.description ? h('div', { style: { whiteSpace: 'pre-wrap' } }, r.description) : null,
          r.lat != null ? h('button', { class: 'btn block', onclick: () => openInMaps(r.lat, r.lng, `موقع ${p?.display_name || 'العضو'}`) }, icon('nav'), 'افتح الموقع في الخرائط')
            : h('div', { class: 'xs muted' }, 'لم يُرفق موقع.'),
          resp.length ? h('div', { class: 'small' }, 'سيتواصل معه: ', resp.map((x) => member(x.user_id)?.display_name || 'عضو').join('، ')) : null,
          r.status === 'open' ? h('div', { class: 'stack', style: { gap: '8px' } },
            !mine && phone ? h('a', { class: 'btn block', href: `tel:${phone.replace(/\s/g, '')}` }, icon('phone'), `اتصل به ${phone}`) : null,
            !mine ? actionBtn(iResponded ? 'تراجعت عن التواصل' : 'سأتواصل معه', iResponded ? 'block' : 'primary block', async () => {
              if (iResponded) await must(state.sb.from('help_responders').delete().eq('request_id', r.id).eq('user_id', myId()));
              else await must(state.sb.from('help_responders').insert({ request_id: r.id }));
              toast('تم الحفظ', 'ok', 1500); load();
            }, iResponded ? 'x' : 'phone') : null,
            canResolve ? actionBtn('تم الحل', 'success block', async () => {
              if (!(await confirmDialog('تأكيد أن المشكلة حُلّت؟'))) return;
              await must(state.sb.rpc('resolve_help', { p_request: r.id })); toast('تم تعليم الطلب محلولًا', 'ok'); load();
            }, 'check') : null,
            mine || isAdmin() ? actionBtn(mine ? 'إلغاء طلبي' : 'حذف الطلب', 'ghost block', async () => {
              if (!(await confirmDialog('حذف الطلب؟', { danger: true, ok: 'حذف' }))) return;
              const d = await must(state.sb.from('help_requests').delete().eq('id', r.id).select('id'));
              if (!d.length) throw new Error('not_allowed');
              toast('تم الحذف', 'ok'); load();
            }, 'trash') : null) : null);
      };
      mount(list,
        open.length ? h('div', { class: 'section-head' }, h('div', { class: 'h2' }, `مفتوحة (${open.length})`)) : h('div', { class: 'form-ok' }, 'لا توجد طلبات مفتوحة الآن.'),
        ...open.map(card),
        done.length ? h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'محلولة مؤخرًا')) : null,
        ...done.map(card));
    } catch (e) { mount(list, errorView(e, load)); }
  }
  load();
  const ch = state.sb.channel('help-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'help_responders' }, load).subscribe();
  const off = on('help', load);
  return () => { state.sb.removeChannel(ch); off(); };
}
