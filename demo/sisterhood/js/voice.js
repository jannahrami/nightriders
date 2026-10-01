// غرفة المحادثة الصوتية: اتصال صوتي مباشر بين الجوالات (WebRTC)، والإشارات عبر قناة Realtime خاصة بالأعضاء.
// كل جهاز يتصل بكل الأجهزة الثانية مباشرة، فالحد الأعلى 6 أشخاص.
import { state, myId, emit } from './core.js';

export const MAX_PEOPLE = 6;
const TOPIC = 'voice-room';
const ICE = () => state.cfg?.iceServers || [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

const v = {
  ch: null, sid: rid(), status: 'idle',   // idle | joining | in
  stream: null, muted: false,
  room: new Map(),       // sid -> { uid, muted, at }  (اللي داخل الغرفة الحين)
  peers: new Map(),      // sid -> { pc, uid, polite, makingOffer, ignoreOffer, audio, out: [], t, level, state }
  myLevel: 0, statsTimer: null, wake: null, error: null, subscribed: false,
};
const changed = () => emit('voice');

// ---------- القناة (تشتغل دائمًا بعد الدخول عشان نعرف مين في الغرفة) ----------
export function initVoice() {
  if (v.ch) return;
  v.ch = state.sb.channel(TOPIC, { config: { private: true, presence: { key: v.sid }, broadcast: { self: false } } })
    .on('presence', { event: 'sync' }, onSync)
    .on('broadcast', { event: 'sig' }, ({ payload }) => onSignal(payload))
    .subscribe((st) => { v.subscribed = st === 'SUBSCRIBED'; if (v.subscribed && v.status === 'in') track(); changed(); });
}
export function stopVoice() {
  leave();
  if (v.ch) { state.sb.removeChannel(v.ch); v.ch = null; v.subscribed = false; }
  v.room.clear(); changed();
}

function onSync() {
  const ps = v.ch.presenceState();
  v.room.clear();
  for (const [sid, metas] of Object.entries(ps)) {
    const m = metas[metas.length - 1];
    if (m?.uid) v.room.set(sid, { uid: m.uid, muted: !!m.muted, at: m.at });
  }
  if (v.status === 'in') {
    for (const [sid, m] of v.room) if (sid !== v.sid && !v.peers.has(sid)) peer(sid, m.uid);
    for (const sid of [...v.peers.keys()]) if (!v.room.has(sid)) dropPeer(sid);
  }
  changed();
}

// ---------- معلومات للواجهة ----------
export function voiceInfo() {
  const people = [...v.room.entries()].map(([sid, m]) => {
    const p = v.peers.get(sid);
    const me = sid === v.sid;
    return { sid, uid: m.uid, muted: m.muted, me,
      speaking: me ? (!v.muted && v.myLevel > 0.04) : (!m.muted && (p?.level || 0) > 0.04),
      conn: me ? 'ok' : (p ? p.state : 'new') };
  }).sort((a, b) => (a.me ? -1 : b.me ? 1 : String(a.at).localeCompare(String(b.at))));
  return { status: v.status, muted: v.muted, people, count: v.room.size, ready: v.subscribed, error: v.error,
    full: v.room.size >= MAX_PEOPLE && v.status !== 'in' };
}
export const inVoice = () => v.status === 'in';

// ---------- الدخول والخروج ----------
export async function join() {
  if (v.status !== 'idle') return;
  if (!v.ch || !v.subscribed) throw new Error('voice_offline');
  if (v.room.size >= MAX_PEOPLE) throw new Error('voice_full');
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('voice_unsupported');
  v.status = 'joining'; v.error = null; changed();
  try {
    v.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    v.status = 'idle'; changed();
    throw new Error(e?.name === 'NotAllowedError' ? 'voice_mic_denied' : 'voice_mic_failed');
  }
  const wasEmpty = [...v.room.keys()].every((s) => s === v.sid);
  v.muted = false;
  v.status = 'in';
  await track();
  if (wasEmpty) state.sb.rpc('voice_room_opened').then(() => {}, () => {});
  for (const [sid, m] of v.room) if (sid !== v.sid && !v.peers.has(sid)) peer(sid, m.uid);
  startStats();
  keepAwake();
  changed();
}

export function leave() {
  if (v.status === 'idle') return;
  v.status = 'idle';
  for (const sid of [...v.peers.keys()]) dropPeer(sid);
  v.stream?.getTracks().forEach((t) => t.stop());
  v.stream = null; v.myLevel = 0;
  clearInterval(v.statsTimer); v.statsTimer = null;
  v.wake?.release?.().catch(() => {}); v.wake = null;
  try { v.ch?.untrack(); } catch { /* */ }
  v.room.delete(v.sid);
  changed();
}

export function toggleMute() {
  if (v.status !== 'in') return;
  v.muted = !v.muted;
  v.stream?.getAudioTracks().forEach((t) => { t.enabled = !v.muted; });
  track();
  changed();
}

function track() {
  if (!v.ch || v.status !== 'in') return Promise.resolve();
  return v.ch.track({ uid: myId(), muted: v.muted, at: new Date().toISOString() }).catch(() => {});
}

// ---------- الاتصال بكل شخص (Perfect negotiation) ----------
function send(to, data) {
  v.ch?.send({ type: 'broadcast', event: 'sig', payload: { from: v.sid, uid: myId(), to, ...data } });
}

function peer(sid, uid) {
  if (v.peers.has(sid)) return v.peers.get(sid);
  const pc = new RTCPeerConnection({ iceServers: ICE() });
  const p = { pc, uid, polite: v.sid > sid, makingOffer: false, ignoreOffer: false, audio: null, out: [], t: null, level: 0, state: 'connecting', restarted: false };
  v.peers.set(sid, p);
  v.stream?.getTracks().forEach((t) => pc.addTrack(t, v.stream));

  pc.onnegotiationneeded = async () => {
    try { p.makingOffer = true; await pc.setLocalDescription(); send(sid, { description: pc.localDescription.toJSON() }); }
    catch (e) { console.warn('voice offer', e); }
    finally { p.makingOffer = false; }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (!candidate) return;
    p.out.push(candidate.toJSON());
    if (!p.t) p.t = setTimeout(() => { p.t = null; const c = p.out.splice(0); if (c.length) send(sid, { candidates: c }); }, 150);
  };
  pc.ontrack = ({ streams, track: tr }) => {
    const stream = streams[0] || new MediaStream([tr]);
    if (!p.audio) {
      p.audio = document.createElement('audio');
      p.audio.autoplay = true; p.audio.playsInline = true; p.audio.setAttribute('playsinline', '');
      p.audio.style.display = 'none';
      document.body.appendChild(p.audio);
    }
    p.audio.srcObject = stream;
    p.audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    p.state = st === 'connected' ? 'ok' : st === 'failed' ? 'failed' : st === 'disconnected' ? 'connecting' : p.state;
    if (st === 'failed' && !p.restarted) { p.restarted = true; try { pc.restartIce(); } catch { /* */ } }
    changed();
  };
  changed();
  return p;
}

async function onSignal(msg) {
  if (!msg || msg.to !== v.sid || v.status !== 'in') return;
  const p = v.peers.get(msg.from) || peer(msg.from, msg.uid);
  const pc = p.pc;
  try {
    if (msg.description) {
      const d = msg.description;
      const collision = d.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      p.ignoreOffer = !p.polite && collision;
      if (p.ignoreOffer) return;
      await pc.setRemoteDescription(d);
      if (d.type === 'offer') { await pc.setLocalDescription(); send(msg.from, { description: pc.localDescription.toJSON() }); }
    }
    if (msg.candidates) {
      for (const c of msg.candidates) {
        try { await pc.addIceCandidate(c); } catch (e) { if (!p.ignoreOffer) console.warn('voice ice', e); }
      }
    }
  } catch (e) { console.warn('voice signal', e); }
}

function dropPeer(sid) {
  const p = v.peers.get(sid);
  if (!p) return;
  clearTimeout(p.t);
  try { p.pc.close(); } catch { /* */ }
  if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
  v.peers.delete(sid);
}

// ---------- مين يتكلم (مستوى الصوت من إحصائيات الاتصال) ----------
function startStats() {
  clearInterval(v.statsTimer);
  v.statsTimer = setInterval(async () => {
    let mine = 0, any = false;
    for (const p of v.peers.values()) {
      try {
        const stats = await p.pc.getStats();
        let lvl = 0;
        stats.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.audioLevel === 'number') lvl = Math.max(lvl, r.audioLevel);
          if (r.type === 'media-source' && r.kind === 'audio' && typeof r.audioLevel === 'number') { mine = Math.max(mine, r.audioLevel); any = true; }
        });
        if (Math.abs(lvl - p.level) > 0.01) p.level = lvl;
      } catch { /* */ }
    }
    v.myLevel = any ? mine : 0;
    emit('voice-level');
  }, 350);
}

// ---------- إبقاء الشاشة شغالة + الرجوع للتطبيق ----------
async function keepAwake() {
  try { v.wake = await navigator.wakeLock?.request('screen'); } catch { v.wake = null; }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || v.status !== 'in') return;
  if (!v.wake || v.wake.released) keepAwake();
  // iPhone يوقف المايك لما التطبيق يروح للخلفية: نرجّعه
  const tr = v.stream?.getAudioTracks()[0];
  if (tr && tr.readyState === 'live') return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const nt = s.getAudioTracks()[0];
    nt.enabled = !v.muted;
    v.stream?.getTracks().forEach((t) => t.stop());
    v.stream = s;
    for (const p of v.peers.values()) {
      const snd = p.pc.getSenders().find((x) => x.track?.kind === 'audio' || x.track === null);
      if (snd) await snd.replaceTrack(nt); else p.pc.addTrack(nt, s);
    }
    for (const p of v.peers.values()) p.audio?.play().catch(() => {});
  } catch { v.error = 'voice_mic_failed'; changed(); }
});
window.addEventListener('pagehide', () => leave());

export const VOICE_ERR = {
  voice_offline: 'الاتصال بالغرفة ما اكتمل. تأكد من الإنترنت وجرّب بعد ثواني.',
  voice_full: `الغرفة ممتلئة (${MAX_PEOPLE} أشخاص كحد أقصى).`,
  voice_unsupported: 'جوالك أو متصفحك ما يدعم المكالمات الصوتية.',
  voice_mic_denied: 'المايك مرفوض. فعّله من الإعدادات ← Safari ← المايكروفون (أو إعدادات الموقع في المتصفح)، وارجع جرّب.',
  voice_mic_failed: 'تعذّر تشغيل المايك. سكّر أي مكالمة ثانية وجرّب مرة ثانية.',
};
