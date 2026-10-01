// السوق: إعلانات بيع بين أعضاء القروب
import { h, mount, icon, topbar, loadingView, errorView, emptyView, fmtRelative, MARKET_CAT, CONDITION, fmtPrice } from '../ui.js';
import { state, must, myId, memberName } from '../core.js';
import { privateImg } from '../media.js';

export default async function marketPage(root) {
  let cat = null, mine = false, q = '';
  let rows = [];
  const list = h('div', { class: 'market-grid' }, loadingView());
  const catRow = h('div', { class: 'picker-row scroll-x' });
  const tabs = h('div', { class: 'seg' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'ابحث في الإعلانات…', maxlength: 60,
    oninput: () => { q = search.value.trim(); draw(); } });

  mount(root, topbar({ title: 'السوق', back: '#/home',
      actions: h('a', { class: 'icon-btn', href: '#/market/new', 'aria-label': 'أضف إعلان' }, icon('plus')) }),
    h('div', { class: 'content stack' },
      h('a', { class: 'btn primary block', href: '#/market/new' }, icon('plus'), 'أضف إعلان'),
      tabs, search, catRow, list,
      h('div', { class: 'xs muted', style: { textAlign: 'center' } }, 'الإعلانات تختفي تلقائيًا بعد 30 يومًا. التطبيق لا يتدخل في البيع — عاين قبل ما تدفع.')));

  function drawFilters() {
    tabs.replaceChildren(
      h('button', { type: 'button', class: !mine ? 'on' : '', onclick: () => { mine = false; drawFilters(); draw(); } }, 'كل الإعلانات'),
      h('button', { type: 'button', class: mine ? 'on' : '', onclick: () => { mine = true; drawFilters(); draw(); } }, 'إعلاناتي'));
    catRow.replaceChildren(
      h('button', { type: 'button', class: 'pick' + (!cat ? ' on' : ''), onclick: () => { cat = null; drawFilters(); draw(); } }, 'الكل'),
      ...Object.entries(MARKET_CAT).map(([k, t]) =>
        h('button', { type: 'button', class: 'pick' + (cat === k ? ' on' : ''), onclick: () => { cat = cat === k ? null : k; drawFilters(); draw(); } }, t)));
  }

  function draw() {
    const now = new Date();
    const qq = q.toLowerCase();
    const shown = rows.filter((r) => (mine ? r.user_id === myId() : new Date(r.expires_at) > now)
      && (!cat || r.category === cat)
      && (!qq || `${r.title} ${r.description || ''} ${r.city || ''}`.toLowerCase().includes(qq)));
    if (!shown.length) {
      mount(list, h('div', { style: { gridColumn: '1 / -1' } }, mine
        ? emptyView('tag', 'ما عندك إعلانات', 'عندك دباب أو قطعة تبي تبيعها؟', h('a', { class: 'btn primary', href: '#/market/new' }, icon('plus'), 'أضف إعلان'))
        : emptyView('tag', q || cat ? 'لا توجد نتائج' : 'السوق فاضي', q || cat ? 'جرّب بحثًا أو تصنيفًا آخر.' : 'كن أول من يعرض شي للبيع.')));
      return;
    }
    mount(list, ...shown.map(card));
  }

  function card(r) {
    const expired = new Date(r.expires_at) <= new Date();
    const thumb = h('div', { class: 'mk-thumb' },
      r.photos?.length ? privateImg(r.photos[0]) : h('div', { class: 'mk-noimg' }, icon('tag')),
      r.status === 'sold' ? h('span', { class: 'mk-badge sold' }, 'مباع') : expired ? h('span', { class: 'mk-badge' }, 'منتهي') : null);
    return h('a', { class: 'mk-card' + (r.status === 'sold' ? ' is-sold' : ''), href: `#/market/${r.id}` },
      thumb,
      h('div', { class: 'mk-body' },
        h('div', { class: 'mk-price' }, fmtPrice(r.price)),
        h('div', { class: 'mk-title' }, r.title),
        h('div', { class: 'xs muted' }, [MARKET_CAT[r.category], CONDITION[r.condition], r.city].filter(Boolean).join(' · ')),
        h('div', { class: 'xs muted' }, `${memberName(r.user_id)} · ${fmtRelative(r.created_at)}`)));
  }

  async function load() {
    try {
      rows = await must(state.sb.from('listings').select('*').order('created_at', { ascending: false }).limit(300));
      // المباع ينزل لتحت
      rows.sort((a, b) => (a.status === 'sold') - (b.status === 'sold'));
      draw();
    } catch (e) { mount(list, h('div', { style: { gridColumn: '1 / -1' } }, errorView(e, load))); }
  }

  drawFilters();
  load();
  const ch = state.sb.channel('market-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, load).subscribe();
  return () => state.sb.removeChannel(ch);
}
