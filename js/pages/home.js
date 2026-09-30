// الصفحة الرئيسية: الطلعة القادمة، جاهز أطلع، الإعلانات، طلبات المساعدة، الاختصارات
import { h, mount, icon, topbar, chip, loadingView, errorView, emptyView, fmtDate, fmtTime, fmtRemaining, fmtRelative, actionBtn, toast, HELP_KIND } from '../ui.js';
import { state, must, on, myId, member, isReady, isAdmin } from '../core.js';
import { avatar } from '../media.js';
import { statusChip, rsvpControl, participationFor } from '../components.js';

export default async function home(root) {
  const nextBox = h('div', null, loadingView());
  const readyBox = h('div');
  const meReadyBox = h('div');
  const annBox = h('div');
  const helpBox = h('div');
  const joinBox = h('div');
  const me = state.me;

  mount(root, topbar({ actions: h('a', { class: 'icon-btn', href: '#/me', 'aria-label': 'حسابي' }, avatar(me, 'sm')) }),
    h('div', { class: 'content stack-lg' },
      h('div', null, h('div', { class: 'muted small' }, 'أهلًا'), h('div', { class: 'h1' }, me.display_name)),
      joinBox,
      helpBox,
      nextBox,
      h('div', { class: 'quick' },
        h('a', { href: '#/rides/new' }, h('span', { class: 'qi' }, icon('plus')), 'طلعة جديدة'),
        h('a', { href: '#/map' }, h('span', { class: 'qi' }, icon('map')), 'الخريطة'),
        h('a', { href: '#/chat' }, h('span', { class: 'qi' }, icon('chat')), 'الشات'),
        h('a', { href: '#/help/new', class: 'sos' }, h('span', { class: 'qi' }, icon('help')), 'أحتاج مساعدة')),
      meReadyBox,
      readyBox,
      annBox));

  // ----- الطلعة القادمة -----
  async function loadNext() {
    try {
      const since = new Date(Date.now() - 12 * 3600e3).toISOString();
      const rides = await must(state.sb.from('rides').select('*').in('status', ['planned', 'ongoing'])
        .gte('meet_at', since).order('meet_at', { ascending: true }).limit(5));
      const ride = rides.find((r) => r.status === 'ongoing') || rides[0];
      if (!ride) {
        mount(nextBox, h('div', { class: 'card' }, emptyView('route', 'لا توجد طلعة قادمة', 'اقترح طلعة وخلّ الشباب يصوّتون.',
          h('a', { class: 'btn primary', href: '#/rides/new' }, icon('plus'), 'اقترح طلعة'))));
        return;
      }
      const part = (await participationFor([ride.id])).get(ride.id);
      const going = await must(state.sb.from('ride_participants').select('user_id').eq('ride_id', ride.id).eq('rsvp', 'going'));
      mount(nextBox, h('div', { class: 'card hero stack' },
        h('div', { class: 'row between' }, h('span', { class: 'eyebrow' }, ride.status === 'ongoing' ? 'الطلعة الجارية' : 'الطلعة القادمة'), statusChip(ride.status)),
        h('a', { href: `#/ride/${ride.id}`, style: { color: 'inherit' } }, h('div', { class: 'h2' }, ride.title)),
        h('div', { class: 'row', style: { alignItems: 'flex-end', gap: '14px' } },
          h('div', { class: 'big-time' }, fmtTime(ride.meet_at)),
          h('div', { class: 'small muted' }, fmtDate(ride.meet_at), h('br'), 'وقت التجمع')),
        h('div', { class: 'place' }, h('div', { class: 'pin meet' }, icon('pin')),
          h('div', { class: 'grow' }, h('div', { class: 'xs muted' }, 'نقطة التجمع'), h('div', { style: { fontWeight: 600 } }, ride.meet_name))),
        h('div', { class: 'row between' },
          h('div', { class: 'avatars', style: { gap: '4px' } }, ...going.slice(0, 7).map((g) => avatar(member(g.user_id), 'sm')),
            going.length > 7 ? h('span', { class: 'chip' }, `+${going.length - 7}`) : null),
          h('span', { class: 'chip green' }, `${part.going} مشارك`)),
        rsvpControl(ride.id, part.mine, { onChanged: loadNext }),
        h('a', { class: 'btn block', href: `#/ride/${ride.id}` }, 'تفاصيل الطلعة')));
    } catch (e) { mount(nextBox, errorView(e, loadNext)); }
  }

  // ----- جاهز أطلع -----
  function drawReady() {
    const ready = [...state.members.values()].filter((p) => p.status === 'active' && isReady(p) && p.id !== myId());
    mount(readyBox, h('div', { class: 'stack' },
      h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'جاهزين يطلعون'), chip(`${ready.length}`, ready.length ? 'green' : '')),
      ready.length
        ? h('div', { class: 'ready-strip' }, ...ready.map((p) => h('a', { class: 'p', href: `#/member/${p.id}` }, avatar(p),
            h('span', null, p.display_name), h('span', { class: 'xs muted' }, `باقي ${fmtRemaining(p.ready_until)}`))))
        : h('div', { class: 'card small muted' }, 'لا أحد مفعّل «جاهز أطلع» الآن.')));
    const mine = state.me;
    const active = isReady(mine);
    const set = async (hours) => {
      const until = hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null;
      const rows = await must(state.sb.from('profiles').update({ ready_until: until }).eq('id', myId()).select('*'));
      if (!rows.length) throw new Error('not_allowed');
      state.me = rows[0]; state.members.set(rows[0].id, rows[0]);
      toast(hours ? `تم التفعيل لمدة ${hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : hours + ' ساعات'}` : 'تم إيقاف «جاهز أطلع»', 'ok', 2000);
      drawReady();
    };
    mount(meReadyBox, h('div', { class: 'card stack' },
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, icon('bolt'), h('div', { class: 'h3' }, 'جاهز أطلع')),
        active ? chip(`مفعّل · باقي ${fmtRemaining(mine.ready_until)}`, 'green live') : chip('غير مفعّل')),
      active
        ? actionBtn('إيقاف', 'danger-soft block', () => set(null), 'stop')
        : h('div', { class: 'btn-row' }, actionBtn('ساعة', '', () => set(1)), actionBtn('ساعتين', '', () => set(2)), actionBtn('4 ساعات', '', () => set(4))),
      h('div', { class: 'xs muted' }, 'يظهر للأعضاء أنك متاح، وينتهي تلقائيًا بعد المدة.')));
  }

  // ----- الإعلانات المثبتة -----
  async function loadAnn() {
    try {
      const rows = await must(state.sb.from('announcements').select('*').eq('pinned', true).order('created_at', { ascending: false }).limit(5));
      mount(annBox, rows.length ? h('div', { class: 'stack' },
        h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'إعلانات الأدمن')),
        ...rows.map((a) => h('div', { class: 'card stack', style: { gap: '6px', borderInlineStart: '3px solid var(--violet)' } },
          h('div', { class: 'row between' }, h('div', { class: 'h3' }, a.title), h('span', { class: 'xs muted' }, fmtRelative(a.created_at))),
          a.body ? h('div', { class: 'small', style: { whiteSpace: 'pre-wrap', color: 'var(--text-2)' } }, a.body) : null))) : null);
    } catch (e) { mount(annBox, errorView(e, loadAnn)); }
  }

  // ----- طلبات المساعدة المفتوحة -----
  async function loadHelp() {
    try {
      const rows = await must(state.sb.from('help_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }));
      mount(helpBox, rows.length ? h('a', { class: 'card link help-card stack', href: '#/help', style: { gap: '8px' } },
        h('div', { class: 'row between' }, h('div', { class: 'row', style: { color: 'var(--red)' } }, icon('help'), h('div', { class: 'h3' }, `طلبات مساعدة مفتوحة (${rows.length})`)), icon('fwd')),
        ...rows.slice(0, 3).map((r) => h('div', { class: 'small' }, `${member(r.user_id)?.display_name || 'عضو'} — ${HELP_KIND[r.kind]} · ${fmtRelative(r.created_at)}`))) : null);
    } catch { mount(helpBox, null); }
  }

  // طلبات الانضمام الجديدة (للأدمن فقط)
  function drawJoin() {
    if (!isAdmin()) { mount(joinBox, null); return; }
    const n = [...state.members.values()].filter((m) => m.status === 'pending').length;
    mount(joinBox, n ? h('a', { class: 'card link stack', href: '#/admin', style: { gap: '4px', borderColor: 'rgba(245,165,36,.5)' } },
      h('div', { class: 'row between' }, h('div', { class: 'row', style: { color: 'var(--amber)' } }, icon('users'), h('div', { class: 'h3' }, `طلبات انضمام جديدة (${n})`)), icon('fwd')),
      h('div', { class: 'small muted' }, 'اضغط للمراجعة والقبول')) : null);
  }

  drawReady(); drawJoin(); loadNext(); loadAnn(); loadHelp();
  const tick = setInterval(drawReady, 60000);
  const ch = state.sb.channel('home-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, loadNext)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_participants' }, loadNext)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, loadAnn)
    .subscribe();
  const offs = [on('members', () => { drawReady(); drawJoin(); }), on('help', loadHelp)];
  return () => { clearInterval(tick); state.sb.removeChannel(ch); offs.forEach((f) => f()); };
}
