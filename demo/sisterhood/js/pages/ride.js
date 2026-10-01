// تفاصيل الطلعة: المواعيد، النقاط، الخريطة، المشاركة، متابعة الحالة، التصويت
import { h, mount, icon, topbar, chip, loadingView, errorView, emptyView, fmtDate, fmtTime, fmtRelative, fmtKm, openInMaps,
  actionBtn, confirmDialog, toast, PROGRESS, STOP_KIND, errMsg, STYLE } from '../ui.js';
import { state, must, myId, member, isAdmin, liveHint } from '../core.js';
import { removeFiles } from '../media.js';
import { makeMap, mapFallback, pinIcon } from '../geo.js';
import { statusChip, rsvpControl, personRow, loadPolls, pollView, openCreatePoll } from '../components.js';
import { openShareConsent } from '../share-ui.js';

export default async function ridePage(root, [id]) {
  let map = null;
  const body = h('div', { class: 'content stack-lg' }, loadingView());
  mount(root, topbar({ title: 'الطلعة', back: '#/rides' }), body);

  let ride, stops, parts, polls;
  async function load() {
    try {
      const r = await must(state.sb.from('rides').select('*').eq('id', id).maybeSingle());
      if (!r) { mount(body, emptyView('route', 'الطلعة غير موجودة', 'ربما حُذفت.', h('a', { class: 'btn', href: '#/rides' }, 'كل الطلعات'))); return; }
      [stops, parts, polls] = await Promise.all([
        must(state.sb.from('ride_stops').select('*').eq('ride_id', id).order('position')),
        must(state.sb.from('ride_participants').select('*').eq('ride_id', id)),
        loadPolls({ rideId: id }),
      ]);
      ride = r;
      draw();
    } catch (e) { mount(body, errorView(e, load)); }
  }

  function draw() {
    if (map) { map.remove(); map = null; }
    const me = myId();
    const canManage = isAdmin() || ride.organizer_id === me || ride.created_by === me;
    const mine = parts.find((p) => p.user_id === me);
    const going = parts.filter((p) => p.rsvp === 'going');
    const maybe = parts.filter((p) => p.rsvp === 'maybe');
    const declined = parts.filter((p) => p.rsvp === 'declined');
    const open = ride.status === 'planned' || ride.status === 'ongoing';
    const mapEl = h('div', { class: 'mini-map' });

    const place = (kind, label, name, lat, lng) => h('div', { class: 'place' },
      h('div', { class: 'pin ' + kind }, icon(kind === 'meet' ? 'pin' : kind === 'dest' ? 'flag' : kind === 'fuel' ? 'fuel' : kind === 'rest' ? 'coffee' : 'dot')),
      h('div', { class: 'grow' }, h('div', { class: 'xs muted' }, label), h('div', { style: { fontWeight: 600 } }, name || '—')),
      lat != null ? h('button', { class: 'btn sm', onclick: () => openInMaps(lat, lng, name) }, icon('nav'), 'افتح') : null);

    const progressBtns = mine?.rsvp === 'going' && ride.status !== 'cancelled'
      ? h('div', { class: 'card stack' },
          h('div', { class: 'h3' }, 'حالتي في الطلعة'),
          h('div', { class: 'seg' }, ...['on_way', 'arrived', 'returned'].map((k) => h('button', {
            class: mine.progress === k ? 'on going' : '',
            onclick: async (e) => {
              const b = e.currentTarget; if (b.disabled) return; b.disabled = true;
              try {
                await must(state.sb.rpc('set_progress', { p_ride: id, p_progress: mine.progress === k ? null : k }));
                toast(mine.progress === k ? 'تم مسح الحالة' : `تم الحفظ: ${PROGRESS[k]}`, 'ok', 1800); await load();
              } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
            },
          }, PROGRESS[k]))),
          mine.progress_at ? h('div', { class: 'xs muted' }, `آخر تحديث ${fmtRelative(mine.progress_at)}`) : null)
      : null;

    const partRow = (p) => {
      const prof = member(p.user_id);
      const tags = [];
      if (p.user_id === ride.organizer_id) tags.push(chip('المنظّم', 'violet'));
      if (p.user_id === ride.leader_id) tags.push(chip('القائد', 'blue'));
      if (p.user_id === ride.sweep_id) tags.push(chip('آخر الركب', 'blue'));
      const prog = p.progress ? chip(`${PROGRESS[p.progress]} · ${fmtRelative(p.progress_at)}`, p.progress === 'returned' ? 'green' : p.progress === 'arrived' ? 'blue' : 'amber') : null;
      return personRow(prof, null, h('div', { class: 'row wrap', style: { justifyContent: 'flex-end', gap: '6px' } }, ...tags, prog));
    };

    const roleSelect = (field, label) => {
      const sel = h('select', { class: 'select' }, h('option', { value: '' }, '— غير محدد —'),
        ...going.map((p) => h('option', { value: p.user_id, selected: ride[field] === p.user_id }, member(p.user_id)?.display_name || 'عضو')));
      sel.onchange = async () => {
        sel.disabled = true;
        try {
          const rows = await must(state.sb.from('rides').update({ [field]: sel.value || null }).eq('id', id).select('id'));
          if (!rows.length) throw new Error('not_allowed');
          toast('تم الحفظ', 'ok', 1500); await load();
        } catch (e) { toast(errMsg(e), 'err'); sel.value = ride[field] || ''; sel.disabled = false; }
      };
      return h('div', { class: 'field' }, h('label', null, label), sel);
    };

    const setStatus = async (status, msg) => {
      if (!(await confirmDialog(msg, { danger: status === 'cancelled' }))) return;
      const rows = await must(state.sb.from('rides').update({ status }).eq('id', id).select('id'));
      if (!rows.length) throw new Error('not_allowed');
      toast('تم تحديث حالة الطلعة', 'ok'); await load();
    };

    const deleteRide = async () => {
      if (!(await confirmDialog('حذف الطلعة نهائيًا مع رسائلها وألبومها؟ لا يمكن التراجع.', { ok: 'حذف نهائي', danger: true }))) return;
      const media = await must(state.sb.from('ride_media').select('path').eq('ride_id', id));
      if (media.length) await removeFiles(media.map((m) => m.path));
      const msgs = await must(state.sb.from('messages').select('image_path').eq('ride_id', id).not('image_path', 'is', null));
      if (msgs.length) await removeFiles(msgs.map((m) => m.image_path));
      const rows = await must(state.sb.from('rides').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('not_allowed');
      toast('تم حذف الطلعة', 'ok'); location.hash = '#/rides';
    };

    mount(body,
      h('div', { class: 'stack' },
        h('div', { class: 'row between' }, h('div', { class: 'row', style: { gap: '6px' } }, statusChip(ride.status), ride.ride_style ? chip(STYLE[ride.ride_style], 'violet', 'bike') : null), liveHint()),
        h('h2', { class: 'h1' }, ride.title),
        h('div', { class: 'small muted' }, 'المنظّم: ', h('a', { href: `#/member/${ride.organizer_id}` }, member(ride.organizer_id)?.display_name || '—')),
        ride.description ? h('p', { style: { margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-2)' } }, ride.description) : null),

      h('div', { class: 'card stack' },
        h('div', { class: 'h3' }, fmtDate(ride.meet_at)),
        h('div', { class: 'timeline' },
          h('div', null, h('b', null, fmtTime(ride.meet_at)), h('span', null, 'التجمع')),
          h('div', null, h('b', null, ride.depart_at ? fmtTime(ride.depart_at) : '—'), h('span', null, 'التحرك')),
          h('div', null, h('b', null, ride.return_at ? fmtTime(ride.return_at) : '—'), h('span', null, 'العودة المتوقعة'))),
        ride.return_at && new Date(ride.return_at).toDateString() !== new Date(ride.meet_at).toDateString()
          ? h('div', { class: 'xs muted' }, `العودة: ${fmtDate(ride.return_at)}`) : null),

      open ? h('div', { class: 'stack' }, h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'مشاركتي')),
        rsvpControl(id, mine?.rsvp, { onChanged: load })) : null,
      progressBtns,

      h('div', { class: 'stack' },
        h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'المسار والنقاط'),
          ride.distance_km != null ? chip(`≈ ${fmtKm(ride.distance_km)}`, 'blue', 'route') : null),
        mapEl,
        ride.route_geojson ? h('div', { class: 'xs muted' }, 'المسار والمسافة تقديرية من خدمة OSRM للخرائط المفتوحة.')
          : h('div', { class: 'notice warn' }, icon('info'), h('div', null, 'لم يُحسب مسار قيادة فعلي لهذه الطلعة، لذلك تظهر النقاط فقط دون خط بينها.')),
        place('meet', 'نقطة التجمع', ride.meet_name, ride.meet_lat, ride.meet_lng),
        ...stops.map((s) => place(s.kind, STOP_KIND[s.kind], s.name, s.lat, s.lng)),
        ride.dest_name || ride.dest_lat != null ? place('dest', 'الوجهة', ride.dest_name || 'الوجهة', ride.dest_lat, ride.dest_lng) : null),

      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: `#/chat/${id}` }, icon('chat'), 'شات الطلعة'),
        h('a', { class: 'btn', href: `#/ride/${id}/album` }, icon('album'), 'الألبوم')),
      open ? h('button', { class: 'btn block outline', onclick: () => openShareConsent({ ride }) }, icon('locate'), 'شارك موقعي أثناء هذه الطلعة') : null,

      h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('div', { class: 'h3' }, 'المشاركون'),
          h('div', { class: 'row', style: { gap: '6px' } }, chip(`${going.length} مشارك`, 'green'), chip(`${maybe.length} يمكن`, 'amber'))),
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('b', null, going.filter((p) => p.progress === 'on_way').length), h('span', null, 'في الطريق')),
          h('div', { class: 'stat' }, h('b', null, going.filter((p) => p.progress === 'arrived').length), h('span', null, 'وصلوا التجمع')),
          h('div', { class: 'stat' }, h('b', null, going.filter((p) => p.progress === 'returned').length), h('span', null, 'رجعوا بالسلامة'))),
        h('div', { class: 'xs muted' }, 'الحالة يحدّثها كل عضو بنفسه. عدم التحديث لا يعني وجود مشكلة — تواصل معه للاطمئنان عند الحاجة.'),
        going.length ? h('div', { class: 'list' }, ...going.map(partRow)) : h('div', { class: 'small muted' }, 'لا يوجد مشاركون مؤكدون بعد.'),
        maybe.length ? h('div', { class: 'stack', style: { gap: '4px' } }, h('div', { class: 'label' }, `يمكن (${maybe.length})`), h('div', { class: 'list' }, ...maybe.map(partRow))) : null,
        declined.length ? h('div', { class: 'small muted' }, `معتذر: ${declined.map((p) => member(p.user_id)?.display_name || 'عضو').join('، ')}`) : null),

      h('div', { class: 'stack' },
        h('div', { class: 'section-head' }, h('div', { class: 'h2' }, 'التصويت'),
          canManage && open ? h('button', { class: 'btn sm', onclick: () => openCreatePoll({ rideId: id, onCreated: load }) }, icon('plus'), 'تصويت') : null),
        polls.length ? polls.map((p) => pollView(p, { onChanged: load })) : h('div', { class: 'small muted' }, 'لا توجد تصويتات لهذه الطلعة.')),

      canManage ? h('div', { class: 'card stack' },
        h('div', { class: 'row' }, icon('settings'), h('div', { class: 'h3' }, 'إدارة الطلعة')),
        roleSelect('leader_id', 'قائد الطلعة (من المشاركين المؤكدين)'),
        roleSelect('sweep_id', 'آخر الركب (من المشاركين المؤكدين)'),
        open ? h('a', { class: 'btn block', href: `#/ride/${id}/edit` }, icon('edit'), 'تعديل التفاصيل') : null,
        ride.status === 'planned' ? actionBtn('بدء الطلعة (جارية)', 'primary block', () => setStatus('ongoing', 'تحويل الطلعة إلى «جارية»؟'), 'play') : null,
        ride.status === 'ongoing' ? actionBtn('إنهاء الطلعة (مكتملة)', 'success block', () => setStatus('completed', 'إنهاء الطلعة؟ ستتوقف مشاركات الموقع المرتبطة بها.'), 'check') : null,
        open ? actionBtn('إلغاء الطلعة', 'danger-soft block', () => setStatus('cancelled', 'إلغاء الطلعة؟ سيرى الجميع أنها ملغاة.'), 'x') : null,
        isAdmin() ? actionBtn('حذف الطلعة نهائيًا', 'ghost block', deleteRide, 'trash') : null) : null);

    // الخريطة المصغرة
    const pts = [];
    if (ride.meet_lat != null) pts.push({ lat: ride.meet_lat, lng: ride.meet_lng, c: '#2f6bff', l: 'ت', n: ride.meet_name });
    stops.forEach((s, i) => pts.push({ lat: s.lat, lng: s.lng, c: s.kind === 'fuel' ? '#d98b0b' : s.kind === 'rest' ? '#16a34a' : '#555c75', l: String(i + 1), n: s.name }));
    if (ride.dest_lat != null) pts.push({ lat: ride.dest_lat, lng: ride.dest_lng, c: '#7a4dff', l: 'و', n: ride.dest_name });
    if (!pts.length) { mapFallback(mapEl, 'لم تُحدد نقاط على الخريطة لهذه الطلعة.'); return; }
    makeMap(mapEl, { center: [pts[0].lat, pts[0].lng], zoom: 12 }).then(({ L, map: m }) => {
      map = m;
      const layers = pts.map((p) => L.marker([p.lat, p.lng], { icon: pinIcon(L, p.c, p.l) }).bindPopup(p.n || ''));
      const group = L.featureGroup(layers).addTo(m);
      if (ride.route_geojson) {
        const line = L.geoJSON(ride.route_geojson, { style: { color: '#29d3ff', weight: 5, opacity: 0.85 } }).addTo(m);
        m.fitBounds(line.getBounds().extend(group.getBounds()), { padding: [30, 30] });
      } else if (pts.length > 1) m.fitBounds(group.getBounds(), { padding: [30, 30] });
    }).catch(() => mapFallback(mapEl));
  }

  await load();
  const ch = state.sb.channel('ride-' + id + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${id}` }, (p) => {
      if (p.eventType === 'DELETE') { toast('تم حذف هذه الطلعة'); location.hash = '#/rides'; } else load();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_participants', filter: `ride_id=eq.${id}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_stops', filter: `ride_id=eq.${id}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, load)
    .subscribe();
  return () => { state.sb.removeChannel(ch); if (map) map.remove(); };
}
