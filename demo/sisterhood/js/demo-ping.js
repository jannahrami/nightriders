// عدّاد زيارات لروابط العرض التجريبي: يسجّل اسم العرض والصفحة والوقت ومعرّفًا عشوائيًا للمتصفح فقط.
// يعمل فقط إذا عُرّف window.NR_DEMO في config.js الخاص بنسخة العرض.
(() => {
  const d = window.NR_DEMO;
  if (!d || !d.id || !d.url || !d.key) return;
  let vid = null;
  try {
    // صاحب العرض يفتح الرابط مرة واحدة بـ ?owner=1 فلا تُحسب زياراته من هذا الجهاز
    if (new URLSearchParams(location.search).get('owner') === '1') localStorage.setItem('nr_demo_owner', '1');
    if (localStorage.getItem('nr_demo_owner') === '1') return;
    vid = localStorage.getItem('nr_demo_vid');
    if (!vid) {
      vid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('nr_demo_vid', vid);
    }
  } catch { /* تخزين المتصفح غير متاح: نكمل بدون معرّف */ }
  const seen = new Set();
  const ping = (page) => {
    if (seen.has(page)) return;
    seen.add(page);
    fetch(d.url.replace(/\/$/, '') + '/rest/v1/rpc/demo_ping', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: d.key, Authorization: 'Bearer ' + d.key },
      body: JSON.stringify({ p_demo: d.id, p_page: page, p_visitor: vid }),
    }).catch(() => {});
  };
  const page = () => (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'home').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'home';
  ping('open');
  ping(page());
  addEventListener('hashchange', () => ping(page()));
})();
