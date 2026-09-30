// قائمة الطلعات + التصويتات العامة
import { h, mount, icon, topbar, loadingView, errorView, emptyView } from '../ui.js';
import { state, must } from '../core.js';
import { rideCard, participationFor, loadPolls, pollView, openCreatePoll } from '../components.js';

export default async function rides(root, _p, query) {
  let tab = query.get('tab') || 'upcoming';
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const list = h('div', { class: 'stack' });
  const pollsBox = h('div', { class: 'stack' });

  mount(root, topbar({ title: 'الطلعات' }),
    h('div', { class: 'content stack-lg' }, tabs, list, pollsBox),
    h('a', { class: 'fab', href: '#/rides/new' }, icon('plus'), 'طلعة جديدة'));

  const drawTabs = () => tabs.replaceChildren(...[['upcoming', 'القادمة والجارية'], ['past', 'السابقة'], ['polls', 'التصويتات']].map(([k, t]) =>
    h('button', { class: 'tab' + (tab === k ? ' on' : ''), role: 'tab', onclick: () => { tab = k; drawTabs(); load(); } }, t)));
  drawTabs();

  async function load() {
    list.hidden = tab === 'polls'; pollsBox.hidden = tab !== 'polls';
    if (tab === 'polls') return loadPollsBox();
    mount(list, loadingView());
    try {
      let q = state.sb.from('rides').select('*');
      q = tab === 'upcoming'
        ? q.in('status', ['planned', 'ongoing']).order('meet_at', { ascending: true })
        : q.in('status', ['completed', 'cancelled']).order('meet_at', { ascending: false }).limit(50);
      const rows = await must(q);
      if (!rows.length) {
        mount(list, emptyView('route', tab === 'upcoming' ? 'لا توجد طلعات قادمة' : 'لا توجد طلعات سابقة',
          tab === 'upcoming' ? 'أي عضو يقدر يقترح طلعة.' : null,
          tab === 'upcoming' ? h('a', { class: 'btn primary', href: '#/rides/new' }, icon('plus'), 'اقترح طلعة') : null));
        return;
      }
      const part = await participationFor(rows.map((r) => r.id));
      mount(list, ...rows.map((r) => rideCard(r, part.get(r.id))));
    } catch (e) { mount(list, errorView(e, load)); }
  }

  async function loadPollsBox() {
    mount(pollsBox, loadingView());
    try {
      const polls = await loadPolls({});
      mount(pollsBox,
        h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'تصويتات عامة'),
          h('button', { class: 'btn sm', onclick: () => openCreatePoll({ onCreated: loadPollsBox }) }, icon('plus'), 'تصويت جديد')),
        h('div', { class: 'xs muted' }, 'تصويتات الطلعات موجودة داخل صفحة كل طلعة.'),
        polls.length ? polls.map((p) => pollView(p, { onChanged: loadPollsBox })) : emptyView('vote', 'لا توجد تصويتات عامة'));
    } catch (e) { mount(pollsBox, errorView(e, loadPollsBox)); }
  }

  load();
  const ch = state.sb.channel('rides-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => tab !== 'polls' && load())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => tab === 'polls' && loadPollsBox())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => tab === 'polls' && loadPollsBox())
    .subscribe();
  return () => state.sb.removeChannel(ch);
}
