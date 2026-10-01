// قائمة أعضاء القروب
import { h, mount, topbar, chip, STYLE, emptyView } from '../ui.js';
import { state, on, isReady } from '../core.js';
import { personRow } from '../components.js';

export default async function membersPage(root) {
  const search = h('input', { class: 'input', type: 'search', placeholder: 'ابحث بالاسم أو المدينة أو الدباب' });
  const list = h('div', { class: 'card' });
  mount(root, topbar({ title: 'أعضاء القروب', back: '#/me' }), h('div', { class: 'content stack' }, search, list));
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = [...state.members.values()].filter((m) => m.status === 'active')
      .filter((m) => !q || [m.display_name, m.city, m.bike_type, m.bike_model].some((x) => (x || '').toLowerCase().includes(q)))
      .sort((a, b) => (isReady(b) - isReady(a)) || a.display_name.localeCompare(b.display_name, 'ar'));
    mount(list, rows.length ? h('div', { class: 'list' }, ...rows.map((m) => personRow(m,
      [m.city, m.bike_type && `${m.bike_type}${m.bike_model ? ' ' + m.bike_model : ''}`, m.riding_style && STYLE[m.riding_style]].filter(Boolean).join(' · '),
      h('div', { class: 'row', style: { gap: '6px' } },
        isReady(m) ? chip('جاهز', 'green') : null,
        m.role === 'owner' ? chip('الأساسي', 'violet') : m.role === 'admin' ? chip('أدمن', 'violet') : null))))
      : emptyView('users', 'لا نتائج'));
  };
  search.addEventListener('input', draw);
  draw();
  const off = on('members', draw);
  return off;
}
