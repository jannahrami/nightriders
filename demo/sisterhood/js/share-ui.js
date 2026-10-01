// واجهة مشاركة الموقع: موافقة صريحة، اختيار المدة، زر إيقاف ظاهر
import { h, icon, openSheet, toast, fmtTime, fmtRemaining, fmtRelative, errMsg } from './ui.js';
import { on, state, must, myId } from './core.js';
import { sharing } from './geo.js';

const MAX_H = 12;

export function openShareConsent({ ride } = {}) {
  if (sharing.active) { toast('أنت تشارك موقعك حاليًا. أوقف المشاركة أولًا لتغيير المدة.'); return; }
  openSheet('مشاركة موقعي', (close) => {
    const opts = [];
    if (ride) {
      const end = ride.return_at ? new Date(ride.return_at) : null;
      const capped = new Date(Math.min(end ? end.getTime() + 3600e3 : Date.now() + 6 * 3600e3, Date.now() + MAX_H * 3600e3));
      if (capped > new Date()) opts.push({ k: 'ride', t: `طوال الطلعة (حتى ${fmtTime(capped)})`, until: capped, ride: ride.id });
    }
    opts.push({ k: '30', t: '30 دقيقة', m: 30 }, { k: '60', t: 'ساعة', m: 60 }, { k: '120', t: 'ساعتين', m: 120 }, { k: '240', t: '4 ساعات', m: 240 }, { k: '480', t: '8 ساعات', m: 480 }, { k: '720', t: '12 ساعة', m: 720 });
    let choice = opts[0].k;
    const picks = h('div', { class: 'picker-row' });
    const drawPicks = () => picks.replaceChildren(...opts.map((o) => h('button', { type: 'button', class: 'pick' + (choice === o.k ? ' on' : ''), onclick: () => { choice = o.k; drawPicks(); } }, o.t)));
    drawPicks();
    const agree = h('input', { type: 'checkbox' });
    const err = h('div', { class: 'form-error', hidden: true });
    const go = h('button', { class: 'btn primary block lg' }, icon('locate'), 'ابدأ المشاركة');
    go.onclick = async () => {
      if (!agree.checked) { err.textContent = 'يلزم الموافقة أولًا.'; err.hidden = false; return; }
      if (go.classList.contains('busy')) return;
      go.classList.add('busy'); err.hidden = true;
      const o = opts.find((x) => x.k === choice);
      const until = (o.until || new Date(Date.now() + o.m * 60000)).toISOString();
      try {
        await sharing.start({ until, rideId: o.ride || null });
        toast('بدأت مشاركة موقعك مع أعضاء القروب', 'ok'); close();
      } catch (e) { err.textContent = e.message && !/^[a-z_]+$/.test(e.message) ? e.message : errMsg(e); err.hidden = false; }
      finally { go.classList.remove('busy'); }
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'small', style: { color: 'var(--text-2)', lineHeight: 1.7 } },
        'سيرى الأعضاء المقبولون فقط موقعك الحالي واسمك وصورتك ووقت آخر تحديث، حتى تنتهي المدة أو توقف المشاركة. لا نحفظ سجل تحركاتك — فقط آخر موقع.'),
      h('div', { class: 'field' }, h('label', null, 'مدة المشاركة'), picks),
      h('div', { class: 'notice warn' }, icon('info'), h('div', null,
        'تحديث الموقع يعمل والتطبيق مفتوح أمامك. إذا أغلقت الشاشة أو انتقلت لتطبيق آخر قد يتوقف التحديث، ويظهر للآخرين أن موقعك قديم.')),
      h('label', { class: 'check' }, agree, h('span', null, 'أوافق على مشاركة موقعي مع أعضاء القروب للمدة المختارة، وسيطلب الجهاز إذن الموقع.')),
      err, go, h('button', { class: 'btn ghost block', onclick: close }, 'إلغاء'));
  });
}

/** بطاقة حالة المشاركة مع زر إيقاف ظاهر، تتحدث تلقائيًا */
export function sharingCard({ compact = false } = {}) {
  const el = h('div');
  let remote = null;
  const checkRemote = async () => {
    if (sharing.active || !myId()) { remote = null; return; }
    try {
      remote = await must(state.sb.from('member_locations').select('share_until,updated_at').eq('user_id', myId()).maybeSingle());
    } catch { remote = null; }
    draw();
  };
  const draw = () => {
    if (!sharing.active) {
      // قد يكون موقعي ما زال ظاهرًا من نافذة أو جهاز آخر: نعرض حالة الخادم الحقيقية
      if (remote && new Date(remote.share_until) > new Date()) {
        const stopRemote = h('button', { class: 'btn danger block lg' }, icon('stop'), 'إيقاف مشاركة الموقع');
        stopRemote.onclick = async () => {
          stopRemote.classList.add('busy');
          try { await must(state.sb.rpc('stop_location_sharing')); remote = null; toast('تم إيقاف المشاركة وحذف موقعك', 'ok'); draw(); }
          catch (e) { toast(errMsg(e), 'err'); stopRemote.classList.remove('busy'); }
        };
        el.replaceChildren(h('div', { class: 'stack', style: { gap: '10px' } },
          h('div', { class: 'row between' }, h('div', { class: 'row' }, icon('locate'), h('div', { class: 'h3' }, 'موقعك ظاهر للأعضاء')),
            h('span', { class: 'chip amber' }, `باقي ${fmtRemaining(remote.share_until)}`)),
          h('div', { class: 'xs muted' }, `يُرسَل من نافذة أو جهاز آخر · آخر تحديث ${fmtRelative(remote.updated_at)}`),
          stopRemote));
        return;
      }
      el.replaceChildren(compact ? h('div') : h('div', { class: 'stack', style: { gap: '10px' } },
        h('div', { class: 'row between' }, h('div', { class: 'row' }, icon('locate'), h('div', { class: 'h3' }, 'مشاركة موقعي')), h('span', { class: 'chip' }, 'متوقفة')),
        h('button', { class: 'btn primary block', onclick: () => openShareConsent() }, 'شارك موقعي')));
      return;
    }
    const stopBtn = h('button', { class: 'btn danger block lg' }, icon('stop'), 'إيقاف مشاركة الموقع');
    stopBtn.onclick = async () => {
      stopBtn.classList.add('busy');
      try { await sharing.stop('user'); toast('تم إيقاف المشاركة وحذف موقعك', 'ok'); }
      catch (e) { toast(`توقف الإرسال من جهازك، لكن تعذّر حذف الموقع من الخادم: ${errMsg(e)}`, 'err', 6000); }
    };
    el.replaceChildren(h('div', { class: 'stack', style: { gap: '10px' } },
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, icon('locate'), h('div', { class: 'h3' }, 'تشارك موقعك الآن')),
        h('span', { class: 'chip green live' }, `باقي ${fmtRemaining(sharing.until)}`)),
      h('div', { class: 'xs muted' },
        sharing.lastSent ? `آخر إرسال ${fmtRelative(sharing.lastSent)}` : 'جارٍ الإرسال…',
        ' · تنتهي ', fmtTime(sharing.until)),
      sharing.lastError ? h('div', { class: 'form-error' }, sharing.lastError) : null,
      stopBtn));
  };
  draw();
  const off = on('sharing', () => { draw(); checkRemote(); });
  const t = setInterval(() => { draw(); checkRemote(); }, 30000);
  checkRemote();
  el._cleanup = () => { off(); clearInterval(t); };
  return el;
}
