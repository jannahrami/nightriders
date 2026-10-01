// صفحة غرفة المحادثة الصوتية
import { h, mount, icon, topbar, toast } from '../ui.js';
import { on, member } from '../core.js';
import { avatar } from '../media.js';
import { voiceInfo, join, leave, toggleMute, VOICE_ERR, MAX_PEOPLE } from '../voice.js';

export default function voicePage(root) {
  const stage = h('div', { class: 'vc-stage' });
  const controls = h('div', { class: 'vc-controls' });
  const status = h('div', { class: 'small muted', style: { textAlign: 'center' } });
  const tiles = new Map();   // sid -> element

  mount(root, topbar({ title: 'غرفة المحادثة الصوتية', back: '#/home' }),
    h('div', { class: 'content stack-lg' },
      status, stage, controls,
      h('div', { class: 'notice' }, icon('info'), h('div', null,
        `خلّ الشاشة مفتوحة والتطبيق قدامك — لو قفلت الجوال أو طلعت من التطبيق ينقطع صوتك. تقدر تتنقل داخل التطبيق عادي وأنت في الغرفة. الحد الأقصى ${MAX_PEOPLE} أشخاص.`))));

  function tile(p) {
    let el = tiles.get(p.sid);
    if (!el) {
      const prof = member(p.uid) || { id: p.uid, display_name: 'عضو' };
      el = h('div', { class: 'vc-tile' }, h('div', { class: 'vc-av' }, avatar(prof, 'lg')),
        h('div', { class: 'vc-name' }, p.me ? 'أنت' : prof.display_name), h('div', { class: 'vc-sub xs muted' }));
      tiles.set(p.sid, el);
    }
    el.classList.toggle('speaking', p.speaking);
    el.classList.toggle('muted', p.muted);
    const sub = el.querySelector('.vc-sub');
    sub.replaceChildren(...[
      p.muted ? h('span', { class: 'vc-mute' }, icon('micoff'), 'مكتوم') : null,
      p.conn === 'connecting' || p.conn === 'new' ? h('span', null, 'يتصل…') : p.conn === 'failed' ? h('span', { class: 'red' }, 'تعذّر الاتصال') : null].filter(Boolean));
    return el;
  }

  function draw() {
    const vi = voiceInfo();
    for (const sid of [...tiles.keys()]) if (!vi.people.some((p) => p.sid === sid)) tiles.delete(sid);
    if (!vi.people.length) {
      stage.replaceChildren(h('div', { class: 'vc-empty' }, h('div', { class: 'vc-empty-ic' }, icon('mic')),
        h('div', { class: 'h3' }, 'الغرفة فاضية'), h('div', { class: 'small muted' }, 'ادخل وافتحها، ويوصل إشعار للشباب إنك فتحتها.')));
    } else stage.replaceChildren(h('div', { class: 'vc-grid' }, ...vi.people.map(tile)));

    status.textContent = !vi.ready ? 'جارٍ الاتصال بالغرفة…'
      : vi.status === 'in' ? `أنت في الغرفة · ${vi.count} ${vi.count === 1 ? 'شخص' : 'أشخاص'}`
      : vi.count ? `${vi.count} داخل الغرفة الحين` : '';

    if (vi.status === 'in') {
      controls.replaceChildren(
        h('button', { class: 'vc-btn' + (vi.muted ? ' off' : ''), type: 'button', onclick: toggleMute, 'aria-label': vi.muted ? 'افتح المايك' : 'اكتم المايك' },
          icon(vi.muted ? 'micoff' : 'mic'), h('span', null, vi.muted ? 'المايك مكتوم' : 'كتم')),
        h('button', { class: 'vc-btn leave', type: 'button', onclick: () => { leave(); toast('طلعت من الغرفة', 'ok'); } }, icon('phoneoff'), h('span', null, 'خروج')));
    } else {
      const b = h('button', { class: 'btn primary block lg', type: 'button', disabled: vi.status === 'joining' || vi.full || !vi.ready },
        icon('mic'), vi.full ? 'الغرفة ممتلئة' : vi.status === 'joining' ? 'جارٍ الدخول…' : vi.count ? 'ادخل الغرفة' : 'افتح الغرفة');
      b.onclick = async () => {
        try { await join(); } catch (e) { toast(VOICE_ERR[e?.message] || 'تعذّر الدخول للغرفة.', 'err', 7000); }
      };
      controls.replaceChildren(b);
    }
  }

  const levelOnly = () => {
    const vi = voiceInfo();
    for (const p of vi.people) { const el = tiles.get(p.sid); if (el) el.classList.toggle('speaking', p.speaking); }
  };
  draw();
  const offs = [on('voice', draw), on('voice-level', levelOnly), on('members', draw)];
  return () => offs.forEach((f) => f());
}
