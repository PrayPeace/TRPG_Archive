/* 화면 시험 공통 (Playwright). 사용: node tests/ui/p0.js   ← 저장소의 화면 파일을 가짜 주소로 내주고, 서버·Deepgram·마이크는 가짜로 바꾼다.
 * GitHub 검사에는 넣지 않았다(브라우저가 필요). 로컬에서 playwright가 있을 때만 돈다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..') + path.sep;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const SITE = 'https://site.test/T/';
const U = 'https://script.google.com/macros/s/ROOMabc123/exec';
const V = { session: '1', sumVer: '1', notesVer: '1', charVer: '1', imgVer: '1', resetVer: '1', colorVer: '1', total: 0 };
const baseData = () => ({ pt: 'PT123', ok: true, v: Object.assign({}, V), summaries: [], notes: null, characters: [], images: [], story: '', rule: { key: 'coc', name: '크툴루의 부름', pc: '탐사자', en: 'X', list: [{ key: 'coc', name: '크툴루의 부름' }] }, roomTitle: '테스트용 채널', theme: {}, glossary: '', keeperName: '', colors: {}, corrections: [], bookmarks: [], charMap: [] });
/* opts: { handle(action, body, url) → 응답 객체(없으면 기본), store: {localStorage 키: 값}, session: {sessionStorage 키: 값}, initScript: 페이지 안에서 먼저 돌릴 함수, clock: 가짜 시계, viewport } */
async function open(browser, opts) {
  opts = opts || {};
  const c = await browser.newContext({ viewport: opts.viewport || { width: 1100, height: 800 }, deviceScaleFactor: 1 });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const saved = {}, calls = [];
  await c.route(SITE + '**', r => { let f = new URL(r.request().url()).pathname.replace(/^\/[^/]+\//, '') || 'index.html'; f = ROOT + f; if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }); });
  await c.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await c.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await c.route('https://script.google.com/**', async r => {
    const u = new URL(r.request().url()); let j = {}; try { j = JSON.parse(r.request().postData() || '{}'); } catch (_) {}
    const a = j.action || u.searchParams.get('action') || ''; calls.push({ a, url: u.origin + u.pathname, body: j });
    const send = o => r.fulfill({ body: JSON.stringify(o), contentType: 'application/json' });
    const own = opts.handle && await opts.handle(a, j, u.origin + u.pathname, { saved });      // handle은 약속(Promise)을 돌려줘도 된다 (늦게 오는 답 흉내)
    if (own === 'abort') return r.abort();
    if (own) return send(own);
    if (a === 'lines') { const sv = [], dp = [], tl = []; (j.items || []).forEach(it => { if (/^big/.test(it.uid)) return tl.push(it.uid); if (saved[it.uid]) { saved[it.uid].n++; dp.push(it.uid); } else { saved[it.uid] = { n: 1, text: it.text, url: u.origin + u.pathname }; sv.push(it.uid); } }); return send({ ok: true, saved: sv, dup: dp, dropped: [], tooLong: tl }); }
    if (a === 'data') return send(baseData());
    if (a === 'token') return send({ ok: true, token: 'tk', keyterms: [] });
    return send({ ok: true, v: Object.assign({}, V), lines: [], presence: [], from: 0 });
  });
  await p.addInitScript(([U, store, session]) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      const all = Object.assign({ t_url: U, t_pw: 'pw', t_name: '대장', t_rooms: JSON.stringify([{ name: '테스트용 채널', rule: 'coc', url: U, pw: 'pw' }]) }, store || {});
      Object.keys(all).forEach(k => localStorage.setItem(k, all[k]));
      const ss = Object.assign({ t_in: U, t_enter: '1' }, session || {}); Object.keys(ss).forEach(k => sessionStorage.setItem(k, ss[k]));
    }
    // 가짜 Deepgram 연결·녹음기·마이크
    window.__ws = [];
    class FakeWS { constructor(u) { this.url = u; this.readyState = 0; this.sent = []; this.bufferedAmount = 0; window.__ws.push(this); }
      send(d) { if (this.failSend > 0) { this.failSend--; throw new Error('가짜: 보내기 실패'); } if (this.failText > 0 && typeof d === 'string') { this.failText--; throw new Error('가짜: 종료 신호 보내기 실패'); } this.sent.push(d && d.tag ? d.tag : String(d).slice(0, 30)); }
      close() { if (this.readyState >= 2) return; this.readyState = 3; setTimeout(() => this.onclose && this.onclose({ code: 1000 }), 0); }
      _open() { this.readyState = 1; this.onopen && this.onopen(); } _msg(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
      _drop(code) { this.readyState = 3; this.onclose && this.onclose({ code: code || 1006 }); } }
    window.WebSocket = FakeWS;
    let recN = 0;
    class FakeRec { constructor() { this.id = ++recN; this.state = 'inactive'; this.n = 0; }
      start() { this.state = 'recording'; this.t = setInterval(() => { this.ondataavailable && this.ondataavailable({ data: { size: 10, tag: 'r' + this.id + 'c' + (this.n++) } }); }, window.__chunkMs || 250); }       // 실제 녹음기와 같은 0.25초 간격
      stop() { if (this.state === 'inactive') return; this.state = 'inactive'; clearInterval(this.t); if (window.__noFinal) return;       // 실제 녹음기처럼: 멈춘 뒤에 마지막 조각과 멈춤 신호가 따로 온다
        setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: { size: 10, tag: 'r' + this.id + 'c' + (this.n++) + 'F' } }); if (!window.__noStop) this.onstop && this.onstop(); }, window.__finalDelay || 20); }       // __finalDelay: 마지막 조각이 늦게 오는 브라우저, __noStop: 멈춤 신호를 주지 않는 브라우저
      static isTypeSupported() { return true; } }
    window.MediaRecorder = FakeRec;
    const md = { getUserMedia: async () => { const tr = { readyState: 'live', stop() { this.readyState = 'ended'; } }; return { getAudioTracks: () => [tr], getTracks: () => [tr] }; } };       // 마이크를 다시 잡을 때마다 새 트랙 (끈 뒤 다시 켜는 시험)
    try { Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true }); } catch (_) {}
  }, [U, opts.store || null, opts.session || null]);
  if (opts.initScript) await p.addInitScript(opts.initScript);
  if (opts.clock) await p.clock.install();
  await p.goto(SITE);
  return { c, p, errs, saved, calls };
}
let pass = 0, fail = 0;
const ok = (l, v, extra) => { v ? pass++ : fail++; console.log((v ? 'PASS ' : 'FAIL ') + l + (extra ? '  ' + extra : '')); };
const done = () => { console.log('\n합계: PASS ' + pass + ' / FAIL ' + fail); process.exit(fail ? 1 : 0); };
module.exports = { open, ok, done, U, SITE, V, baseData };
