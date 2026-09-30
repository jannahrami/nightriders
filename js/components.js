// مكوّنات مشتركة: بطاقة الطلعة، أزرار المشاركة، التصويت، صف العضو
import { h, icon, chip, fmtDate, fmtTime, fmtRelative, RIDE_STATUS, RSVP, actionBtn, confirmDialog, toast, openSheet, fromRiyadhInput, errMsg } from './ui.js';
import { state, must, myId, member, isAdmin } from './core.js';
import { avatar } from './media.js';

export function statusChip(status) {
  const s = RIDE_STATUS[status] || RIDE_STATUS.planned;
  return chip(s.t, s.c);
}

export function rideCard(ride, { going = 0, mine } = {}) {
  return h('a', { class: 'card link ride-card stack', href: `#/ride/${ride.id}`, style: { gap: '8px' } },
    h('div', { class: 'row between' }, h('div', { class: 'h3 grow' }, ride.title), statusChip(ride.status)),
    h('div', { class: 'when' }, fmtDate(ride.meet_at), ' · ', h('span', { class: 'ltr' }, fmtTime(ride.meet_at))),
    h('div', { class: 'meta' },
      h('span', null, icon('pin'), ride.meet_name),
      ride.dest_name ? h('span', null, icon('flag'), ride.dest_name) : null,
      h('span', null, icon('users'), `${going} مشارك`)),
    mine ? h('div', null, chip(`أنت: ${RSVP[mine]}`, mine === 'going' ? 'green' : mine === 'maybe' ? 'amber' : 'red')) : null);
}

/** أعداد المشاركين المؤكدين لكل طلعة + حالتي */
export async function participationFor(rideIds) {
  const out = new Map();
  if (!rideIds.length) return out;
  const rows = await must(state.sb.from('ride_participants').select('ride_id,user_id,rsvp').in('ride_id', rideIds));
  for (const id of rideIds) out.set(id, { going: 0, mine: null });
  for (const r of rows) {
    const o = out.get(r.ride_id);
    if (r.rsvp === 'going') o.going++;
    if (r.user_id === myId()) o.mine = r.rsvp;
  }
  return out;
}

export function rsvpControl(rideId, current, { disabled, onChanged } = {}) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'حالة مشاركتي' });
  let value = current, busy = false;
  const draw = () => {
    seg.replaceChildren(...['going', 'maybe', 'declined'].map((k) => h('button', {
      class: (value === k ? 'on ' : '') + k, disabled: disabled || busy, 'aria-pressed': value === k ? 'true' : 'false',
      onclick: async () => {
        if (busy || value === k) return;
        busy = true; draw();
        try {
          await must(state.sb.rpc('set_rsvp', { p_ride: rideId, p_rsvp: k }));
          value = k; toast(`تم الحفظ: ${RSVP[k]}`, 'ok', 1800);
          onChanged && onChanged(k);
        } catch (e) { toast(errMsg(e), 'err'); }
        finally { busy = false; draw(); }
      },
    }, RSVP[k])));
  };
  draw();
  return seg;
}

export function personRow(p, extra, right) {
  return h('div', { class: 'item' },
    h('a', { class: 'person grow', href: p ? `#/member/${p.id}` : null, style: { color: 'inherit' } },
      avatar(p), h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'name' }, p?.display_name || 'عضو سابق'), extra ? h('div', { class: 'xs muted' }, extra) : null)),
    right || null);
}

// ---------- التصويت ----------
export async function loadPolls(filter) {
  let q = state.sb.from('polls').select('*').order('created_at', { ascending: false });
  q = filter.rideId ? q.eq('ride_id', filter.rideId) : q.is('ride_id', null);
  const polls = await must(q.limit(20));
  if (!polls.length) return [];
  const ids = polls.map((p) => p.id);
  const [opts, votes] = await Promise.all([
    must(state.sb.from('poll_options').select('*').in('poll_id', ids).order('position')),
    must(state.sb.from('poll_votes').select('*').in('poll_id', ids)),
  ]);
  return polls.map((p) => ({ ...p, options: opts.filter((o) => o.poll_id === p.id), votes: votes.filter((v) => v.poll_id === p.id) }));
}

export function pollView(poll, { onChanged } = {}) {
  const open = !poll.closes_at || new Date(poll.closes_at) > new Date();
  const total = poll.votes.length;
  const mine = poll.votes.find((v) => v.user_id === myId())?.option_id;
  const canManage = poll.created_by === myId() || isAdmin();
  let busy = false;
  const vote = async (optId) => {
    if (busy || !open) return;
    busy = true;
    try {
      if (optId === mine) await must(state.sb.rpc('retract_vote', { p_poll: poll.id }));
      else await must(state.sb.rpc('cast_vote', { p_poll: poll.id, p_option: optId }));
      onChanged && onChanged();
    } catch (e) { toast(errMsg(e), 'err'); busy = false; }
  };
  return h('div', { class: 'card stack' },
    h('div', { class: 'row between' },
      h('div', { class: 'row', style: { gap: '8px' } }, icon('vote'), h('div', { class: 'h3' }, poll.question)),
      open ? chip('مفتوح', 'green') : chip('مغلق', '')),
    ...poll.options.map((o) => {
      const n = poll.votes.filter((v) => v.option_id === o.id).length;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const voters = poll.votes.filter((v) => v.option_id === o.id).map((v) => member(v.user_id)?.display_name).filter(Boolean);
      return h('button', { class: 'poll-opt' + (mine === o.id ? ' mine' : ''), disabled: !open, onclick: () => vote(o.id), title: voters.join('، ') },
        h('span', { class: 'bar', style: { width: pct + '%' } }),
        mine === o.id ? icon('check') : null,
        h('span', null, o.label),
        h('span', { class: 'n' }, `${n}`));
    }),
    h('div', { class: 'row between xs muted' },
      h('span', null, `${total} صوت · صوت واحد لكل عضو${open ? ' · اضغط خيارك مرة ثانية لسحب صوتك' : ''}`),
      poll.closes_at && open ? h('span', null, `يُغلق ${fmtRelative(poll.closes_at)}`) : null),
    canManage ? h('div', { class: 'row' },
      open ? actionBtn('إغلاق التصويت', 'sm', async () => { await must(state.sb.rpc('close_poll', { p_poll: poll.id })); toast('تم إغلاق التصويت', 'ok'); onChanged && onChanged(); }) : null,
      actionBtn('حذف', 'sm danger-soft', async () => {
        if (!(await confirmDialog('حذف هذا التصويت ونتائجه؟', { ok: 'حذف', danger: true }))) return;
        const d = await must(state.sb.from('polls').delete().eq('id', poll.id).select('id'));
        if (!d.length) throw new Error('not_allowed');
        toast('تم الحذف', 'ok'); onChanged && onChanged();
      }, 'trash')) : null);
}

export function openCreatePoll({ rideId, onCreated }) {
  openSheet('تصويت جديد', (close) => {
    let kind = rideId ? 'destination' : 'other';
    const q = h('input', { class: 'input', maxlength: 140, placeholder: 'مثال: وين نروح الخميس؟' });
    const optsBox = h('div', { class: 'stack', style: { gap: '8px' } });
    const kindSeg = h('div', { class: 'seg' });
    const err = h('div', { class: 'form-error', hidden: true });
    const addOpt = () => {
      if (optsBox.children.length >= 8) return;
      const inp = kind === 'time'
        ? h('input', { class: 'input', type: 'datetime-local', dataset: { t: 'time' } })
        : h('input', { class: 'input', maxlength: 100, placeholder: `خيار ${optsBox.children.length + 1}` });
      optsBox.appendChild(h('div', { class: 'row' }, inp,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'حذف الخيار', onclick: (e) => e.currentTarget.parentElement.remove() }, icon('x'))));
    };
    const drawKind = () => {
      kindSeg.replaceChildren(...[['destination', 'الوجهة'], ['time', 'الموعد'], ['other', 'أخرى']].map(([k, t]) =>
        h('button', { type: 'button', class: kind === k ? 'on' : '', onclick: () => { kind = k; drawKind(); optsBox.replaceChildren(); addOpt(); addOpt(); } }, t)));
    };
    drawKind(); addOpt(); addOpt();
    const closes = h('select', { class: 'select' },
      h('option', { value: '' }, 'بدون وقت إغلاق'), h('option', { value: '6' }, 'بعد 6 ساعات'),
      h('option', { value: '24' }, 'بعد 24 ساعة'), h('option', { value: '72' }, 'بعد 3 أيام'));
    const save = actionBtn('نشر التصويت', 'primary block', async () => {
      err.hidden = true;
      const options = [...optsBox.querySelectorAll('input')].map((i) => {
        if (i.dataset.t === 'time') {
          const iso = fromRiyadhInput(i.value);
          return iso ? { label: `${fmtDate(iso)} · ${fmtTime(iso)}`, time: iso } : null;
        }
        return i.value.trim() ? { label: i.value.trim() } : null;
      }).filter(Boolean);
      if (q.value.trim().length < 3) { err.textContent = 'اكتب السؤال.'; err.hidden = false; return; }
      if (options.length < 2) { err.textContent = 'أضف خيارين على الأقل.'; err.hidden = false; return; }
      const hrs = closes.value ? Number(closes.value) : null;
      await must(state.sb.rpc('create_poll', { p_ride: rideId || null, p_question: q.value.trim(), p_kind: kind,
        p_closes_at: hrs ? new Date(Date.now() + hrs * 3600e3).toISOString() : null, p_options: options }));
      toast('تم نشر التصويت', 'ok'); close(); onCreated && onCreated();
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'field' }, h('label', null, 'نوع التصويت'), kindSeg),
      h('div', { class: 'field' }, h('label', null, 'السؤال'), q),
      h('div', { class: 'field' }, h('label', null, 'الخيارات'), optsBox,
        h('button', { class: 'btn sm outline', type: 'button', onclick: addOpt }, icon('plus'), 'إضافة خيار')),
      h('div', { class: 'field' }, h('label', null, 'إغلاق التصويت'), closes), err, save);
  });
}
