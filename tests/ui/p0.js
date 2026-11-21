// 발언 원문 보존 (화면 시험, 가짜 Deepgram·가짜 녹음기). 여기서 통과한 것은 "화면 코드가 조각을 이 순서로 내보낸다"는 것까지다.
// 실제 음성이 Deepgram에서 글로 복구되는지는 이 시험으로 알 수 없다 (실제 환경 확인 항목).
const { chromium } = require('playwright'); const { open, ok, done, U } = require('./harness.js');
const wait = (p, ms) => p.waitForTimeout(ms);
const real = ms => new Promise(r => setTimeout(r, ms));      // 가짜 시계와 별개로, 실제 통신(가짜 서버 응답)이 끝나기를 기다린다
const only = process.argv[2] || '';
const part = async (tag, fn) => { if (only && !only.split(',').includes(tag)) return; try { await fn(); } catch (e) { ok('[' + tag + '] 시험이 끝까지 돎', false, String(e && e.message || e).slice(0, 300)); } };
// Deepgram 결과 한 건 (start·duration = 소리 위치, 초)
const R = (final, text, start, dur) => ({ type: 'Results', is_final: final, start, duration: dur, channel: { alternatives: [{ transcript: text }] } });
const last = p => p.evaluate(() => __ws.length - 1);
const chunks = (p, i) => p.evaluate(i => __ws[i < 0 ? __ws.length + i : i].sent.filter(x => /^r\d+c/.test(x)), i);
const texts = saved => Object.values(saved).map(x => x.text);
(async () => {
  const b = await chromium.launch();
  await part('1', async () => { // ① 확정 전 글 표시, 끊긴 동안의 소리 이어 보내기(천천히), 끌 때 마지막 조각 → CloseStream
    const { p, saved, errs } = await open(b); await wait(p, 1200);
    await p.click('#micBtn'); await wait(p, 300);
    await p.evaluate(() => __ws[0]._open()); await wait(p, 1300);
    await p.evaluate(R => { __ws[0]._msg(R[0]); __ws[0]._msg(R[1]); }, [R(true, '확정된 말', 0, 0.8), R(false, '지하실 문을 열어 본다', 0.8, 0.4)]);
    await wait(p, 100);
    const sentBefore = await chunks(p, 0);
    await p.evaluate(() => __ws[0]._drop(1006)); await wait(p, 5000);
    ok('연결이 끊길 때 확정 전 글을 "(확정 전)" 표시와 함께 저장 (확정 글과 구별)', texts(saved).includes('지하실 문을 열어 본다 (확정 전)') && texts(saved).includes('확정된 말') && !texts(saved).includes('지하실 문을 열어 본다'), JSON.stringify(texts(saved)));
    await wait(p, 600);        // 다시 연결을 시도하는 중 (아직 열리지 않음): 그동안의 소리는 메모리에
    const n = await p.evaluate(() => ({ ws: __ws.length, buf: rec ? rec.q.length : -1, sent: rec && rec.sent }));
    ok('끊긴 동안의 소리를 새 녹음으로 메모리에 모음', n.ws >= 2 && n.buf >= 18 && !n.sent, JSON.stringify(n));
    await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 350);
    const early = await chunks(p, -1);
    ok('다시 연결돼도 모아 둔 소리를 한꺼번에 붓지 않음 (0.1초에 한 조각)', early.length >= 2 && early.length <= 6 && early.length < n.buf / 2, early.length + '조각 / 모아 둔 ' + n.buf);
    await wait(p, 9000);
    const s2 = await chunks(p, -1), left = await p.evaluate(() => rec.q.length);
    const rid = s2[0].split('c')[0], seq = s2.map(x => Number(x.split('c')[1]));
    ok('새 녹음의 첫 조각(머리말)부터 빠짐없이 순서대로, 밀린 것을 다 보냄', rid !== sentBefore[0].split('c')[0] && seq[0] === 0 && seq.every((x, i) => x === i) && s2.every(x => x.startsWith(rid + 'c')) && left <= 3, s2.slice(0, 3).join(',') + ' … ' + s2.length + '조각, 남은 ' + left);
    const g = await p.evaluate(() => ({ gaps: gapGet(), q: queue.map(x => x.text), n: statLoad().n }));
    ok('받아 적힌 곳(1.2초)부터 새 녹음 시작까지가 1초 미만이면 누락 구간으로 적지 않음', g.gaps.length === 0, JSON.stringify(g.gaps));
    ok('소켓에 넘긴 것만으로는 "복구됨"으로 세지 않음 (Deepgram 확인 전)', g.n.recovTry === 1 && !g.n.recovOk, JSON.stringify(g.n));
    const sec = await p.evaluate(() => ws._replay ? ws._replay.sec : -1);
    await p.evaluate(([R, sec]) => { ws._msg(Object.assign(R, { start: 0, duration: sec })); }, [R(true, '끊긴 동안 한 말', 0, 1), sec]); await wait(p, 100);
    const g2 = await p.evaluate(() => statLoad().n);
    ok('Deepgram이 그 소리를 끝까지 처리했다고 알려 오면 복구 확인으로 셈', g2.recovOk === 1 && g2.recovSec >= 5, JSON.stringify(g2));
    // 받아쓰기를 끌 때: 마지막 조각 → CloseStream 순서, 그 뒤 Deepgram이 확정해 주면 확정 글로
    await p.evaluate(R => ws._msg(R), R(false, '끄기 직전에 한 말', 20, 1));
    await p.click('#micBtn'); await wait(p, 400);
    const tail = await p.evaluate(() => { const s = __ws[__ws.length - 1].sent; return { lastChunk: s.map((x, i) => (/^r\d+c/.test(x) ? i : -1)).filter(i => i >= 0).pop(), close: s.findIndex(x => /CloseStream/.test(x)), fin: s.some(x => /F$/.test(x)), closeN: s.filter(x => /CloseStream/.test(x)).length }; });
    ok('끌 때 녹음기의 마지막 조각을 보낸 뒤에 CloseStream을 보냄', tail.fin && tail.close > tail.lastChunk && tail.closeN === 1, JSON.stringify(tail));
    await p.evaluate(R => { const w = __ws[__ws.length - 1]; w._msg(R); w._drop(1000); }, R(true, '끄기 직전에 한 말 끝까지', 20, 2)); await wait(p, 5500);
    ok('끈 뒤 Deepgram이 확정해 준 글은 확정 글로 저장하고, 확정 전 글을 따로 또 적지 않음', texts(saved).includes('끄기 직전에 한 말 끝까지') && !texts(saved).some(t => /끄기 직전에 한 말 \(확정 전\)/.test(t)), JSON.stringify(texts(saved)));
    // 다시 켜서: Deepgram이 확정해 주지 않고 닫히면 확정 전 글로 저장
    await p.click('#micBtn'); await wait(p, 300); await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 400);
    await p.evaluate(R => ws._msg(R), R(false, '확정이 안 온 말', 0, 0.3));
    await p.click('#micBtn'); await wait(p, 9000);
    ok('끌 때 확정이 오지 않으면 3초 남짓 기다린 뒤 "(확정 전)"으로 저장', texts(saved).includes('확정이 안 온 말 (확정 전)'), JSON.stringify(texts(saved)));
    ok('화면 오류 없음 (①)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('2', async () => { // ② 말한 시각·세션, 소리 위치로 중복 거르기, 옛 연결의 늦은 글, 보내기 실패
    let sess = '1';
    const { p, saved, calls, errs } = await open(b, { handle: (a, j) => (a === 'poll' ? { ok: true, v: { session: sess, sumVer: '1', notesVer: '1', charVer: '1', imgVer: '1', resetVer: '1', colorVer: '1', total: 0 }, lines: [], presence: [], from: 0 } : null) });
    await wait(p, 1200); await p.click('#micBtn'); await wait(p, 300);
    await p.evaluate(() => __ws[0]._open()); await wait(p, 300);
    const t0 = await p.evaluate(() => rec.t0);
    await p.evaluate(() => { __ws[0].failSend = 2; }); await wait(p, 1200);        // 조각 보내기가 두 번 실패
    const sq = (await chunks(p, 0)).map(x => Number(x.split('c')[1]));
    ok('조각 보내기가 실패해도 그 조각을 버리지 않고 순서대로 다시 보냄', sq.every((x, i) => x === i) && sq.length >= 4 && (await p.evaluate(() => statLoad().n.sendFail)) >= 1, sq.join(','));
    sess = '2'; await wait(p, 5000);                                              // 세션 2로 넘어감 (poll이 알려 줌)
    await p.evaluate(R => { R.forEach(r => __ws[0]._msg(r)); }, [R(true, '세션 1 때 한 말', 0.5, 1.0), R(true, '세션 1 때 한 말', 0.5, 1.0), R(false, '세션 1 때', 0.5, 0.6), R(true, '같은 글이지만 다른 때 한 말', 5.9, 1.0), R(true, '같은 글이지만 다른 때 한 말', 6.9, 1.0)]);
    await wait(p, 4500);
    const q = calls.filter(c => c.a === 'lines').flatMap(c => c.body.items);
    const first = q.filter(x => x.text === '세션 1 때 한 말');
    ok('같은 소리 구간을 다시 가리키는 확정 결과는 한 번만 저장 (소리 위치로 판단)', first.length === 1 && !q.some(x => /세션 1 때 \(확정 전\)/.test(x.text)), JSON.stringify(q.map(x => x.text)));
    ok('글이 같아도 소리 위치가 다르면 둘 다 저장 (문장이 같다고 지우지 않음)', new Set(q.filter(x => x.text === '같은 글이지만 다른 때 한 말').map(x => x.uid)).size === 2);
    ok('발언 시각은 말한 순간 (녹음 시작 + 소리 위치)', first[0] && Math.abs(Date.parse(first[0].t) - (t0 + 500)) < 60, first[0] && (Date.parse(first[0].t) - t0) + 'ms');
    ok('세션이 넘어간 뒤 도착해도, 말한 때의 세션(1)을 붙임', first[0] && first[0].session === '1' && q.find(x => x.text === '같은 글이지만 다른 때 한 말').session === '2', JSON.stringify(q.map(x => x.session)));
    // 옛 연결에서 늦게 오는 글
    await p.evaluate(R => { __ws[0]._msg(R); }, R(false, '끊기기 직전의 말', 8, 1)); await p.evaluate(() => __ws[0]._drop(1006)); await wait(p, 1500);
    await p.evaluate(R => { __ws[0]._msg(R); }, R(true, '끊기기 직전의 말', 8, 1.2)); await wait(p, 4500);
    const q2 = calls.filter(c => c.a === 'lines').flatMap(c => c.body.items).filter(x => /끊기기 직전의 말/.test(x.text));
    ok('끊긴 연결에서 늦게 온 확정 글은 쓰지 않음 (이미 "(확정 전)"으로 저장한 말이 두 번 적히지 않음)', new Set(q2.map(x => x.uid)).size === 1 && q2[0].text === '끊기기 직전의 말 (확정 전)', JSON.stringify(q2.map(x => x.text)));
    ok('화면 오류 없음 (②)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('3', async () => { // ③ 90초 넘게 끊김 → 가장 오래된 녹음을 버리고 최근 것만, 버린 구간을 적음
    const { p, saved, errs } = await open(b, { clock: true }); await real(800); await p.clock.runFor(1500); await real(500);
    await p.click('#micBtn'); await real(600); await p.clock.runFor(300); await real(300);
    await p.evaluate(() => __ws[0]._open()); await p.clock.runFor(2000);
    await p.evaluate(R => __ws[0]._msg(R), R(true, '끊기기 전', 0, 2)); await p.evaluate(() => __ws[0]._drop(1006));
    for (let i = 0; i < 12; i++) { await p.clock.runFor(10000); await real(150); }
    const mid = await p.evaluate(() => ({ age: Date.now() - rec.t0, buf: rec.q.length, gapFrom: !!gapFrom }));
    ok('90초를 넘기면 오래된 녹음을 버리고 새로 모음 (메모리에는 최근 90초 이내만)', mid.age < 90000 && mid.buf * 250 <= 91000 && mid.gapFrom, JSON.stringify(mid));
    await p.evaluate(() => __ws[__ws.length - 1]._open()); for (let i = 0; i < 4; i++) { await p.clock.runFor(2500); await real(300); }
    const r = await p.evaluate(() => ({ gaps: gapGet(), box: document.getElementById('gapBox').textContent, hidden: document.getElementById('gapBox').classList.contains('hide'), st: document.getElementById('sendSt').textContent, first: __ws[__ws.length - 1].sent.find(x => /^r\d+c/.test(x)) }));
    const line = texts(saved).find(t => /^※ 받아쓰기 끊김/.test(t)) || '';
    ok('버린 구간(약 90초)을 시각과 함께 적음', r.gaps.length === 1 && r.gaps[0].sec >= 88 && r.gaps[0].sec <= 95 && !r.hidden && /빠졌을 수 있는 구간 1곳/.test(r.box), JSON.stringify(r.gaps));
    ok('대화에도 "※ 받아쓰기 끊김" 줄을 남김', /약 1분 3\d초/.test(line), line);
    ok('"모두 저장됨" 옆에 누락 구간을 따로 표시', /빠졌을 수 있는 구간 1곳/.test(r.st), r.st);
    ok('남은 최근 녹음은 첫 조각부터 보냄', /c0$/.test(r.first || ''), r.first);
    ok('화면 오류 없음 (③)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('3b', async () => { // 짧은 끊김, 닫힘 신호 없는 죽은 연결, 구간 목록을 기기에 적지 못할 때
    const { p, saved, errs } = await open(b, { initScript: () => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__gapFull && String(k).startsWith('t_gap:')) throw new Error('QuotaExceededError'); return o.call(this, k, v); }; } });
    await wait(p, 1200); await p.click('#micBtn'); await wait(p, 300);
    await p.evaluate(() => __ws[0]._open()); await wait(p, 2600);
    await p.evaluate(R => __ws[0]._msg(R), R(true, '여기까지 받아 적힘', 0, 0.6));             // Deepgram은 0.6초까지만 확인. 그 뒤 2초는 소켓에 넘겼지만 확인되지 않음
    await p.evaluate(() => __ws[0]._drop(1006)); await wait(p, 300);
    const g1 = await p.evaluate(() => gapGet());
    ok('5초보다 짧은 끊김(약 2초)도 누락 가능 구간으로 적음', g1.length === 1 && g1[0].sec >= 1 && g1[0].sec <= 3, JSON.stringify(g1));
    await wait(p, 5000);
    ok('3초 미만 구간은 대화에 안내 줄을 만들지 않음 (기기 목록에만)', !texts(saved).some(t => /^※ 받아쓰기 끊김/.test(t)));
    // 닫힘 신호 없이 죽은 연결 ①: 소켓에 쌓인 소리가 빠지지 않음
    await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 600);
    const i1 = await last(p);
    await p.evaluate(() => { ws.bufferedAmount = 5000; }); await wait(p, 7500);
    const s1 = await p.evaluate(i => ({ dead: !!__ws[i]._dead, n: __ws.length, why: JSON.parse(localStorage.getItem('t_disc') || '[]').map(x => x.why) }), i1);
    ok('소켓에 쌓인 소리가 5초 넘게 빠지지 않으면 끊긴 것으로 보고 새로 연결 (닫힘 신호를 기다리지 않음)', s1.dead && s1.n > i1 + 1 && s1.why.includes('전송 정체'), JSON.stringify(s1));
    // ②: 브라우저가 오프라인이라고 알림
    await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 400);
    const i2 = await last(p);
    await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await wait(p, 200);
    ok('오프라인 신호가 오면 바로 끊긴 것으로 처리하고 소리를 모으기 시작', await p.evaluate(i => !!__ws[i]._dead && !!rec && rec.w === null && !rec.sent, i2));
    // 구간 목록을 기기에 적지 못해도 화면에는 보인다
    await p.evaluate(() => { window.__gapFull = true; noteGap(Date.now() - 4000, Date.now(), '시험'); });
    const g3 = await p.evaluate(U => ({ get: gapGet().length, mem: gapMem.length, ls: JSON.parse(localStorage.getItem('t_gap:' + U) || '[]').length, box: document.getElementById('gapBox').textContent }), U);
    ok('구간을 기기에 적지 못해도 gapGet()이 메모리의 것을 함께 돌려줌', g3.mem === 1 && g3.get === g3.ls + 1 && /이 창에만/.test(g3.box), JSON.stringify(g3));
    ok('화면 오류 없음 (③b)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('3c', async () => { // Deepgram이 8초 넘게 답이 없을 때: 방 주소에 가볍게 물어보고, 그것도 안 되면 끊긴 것으로
    let netDown = false;
    const { p, calls, errs } = await open(b, { handle: (a) => (a === 'ver' && netDown ? 'abort' : null) });
    await wait(p, 1200); await p.click('#micBtn'); await wait(p, 300);
    await p.evaluate(() => __ws[0]._open()); await wait(p, 10500);
    const a1 = await p.evaluate(() => ({ dead: !!__ws[0]._dead, n: __ws.length }));
    ok('조용해서 답이 없는 것은 끊김으로 보지 않음 (방 주소가 답함)', !a1.dead && a1.n === 1 && calls.filter(c => c.a === 'ver').length === 1, JSON.stringify(a1) + ' ver ' + calls.filter(c => c.a === 'ver').length);
    netDown = true; await wait(p, 22000);
    const a2 = await p.evaluate(() => ({ dead: !!__ws[0]._dead, why: JSON.parse(localStorage.getItem('t_disc') || '[]').map(x => x.why) }));
    ok('방 주소도 답하지 않으면 끊긴 것으로 보고 소리를 모으기 시작', a2.dead && a2.why.includes('응답 없음'), JSON.stringify(a2));
    ok('화면 오류 없음 (③c)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('4', async () => { // ④ 서버가 거절한 말 + 실패 목록을 localStorage에 못 씀 → 두 번째 자리에 보관. 둘 다 안 되면 메모리에만 있다고 알림
    const now = new Date().toISOString();
    const init = () => { const o = Storage.prototype.setItem; window.__failFull = true; Storage.prototype.setItem = function (k, v) { if (window.__failFull && String(k).startsWith('t_fail:')) throw new Error('QuotaExceededError'); return o.call(this, k, v); }; };
    const { p, saved, errs } = await open(b, { store: { ['t_q:' + U]: JSON.stringify([{ uid: 'big1', name: '대장', text: '아주 긴 말 원문', t: now }, { uid: 'ok1', name: '대장', text: '보통 말', t: now }]) }, initScript: init });
    await wait(p, 6000);
    const r = await p.evaluate(async U => ({ mem: failMem.map(x => x.text), memOnly: failMemOnly(), stored: localStorage.getItem('t_fail:' + U), q: queue.length, db: (await qdb.all(U)).map(x => x.st + ':' + x.uid), box: document.getElementById('failBox').textContent, pill: document.getElementById('sendPill').textContent, st: document.getElementById('sendSt').textContent }), U);
    ok('실패 목록을 localStorage에 못 써도 두 번째 자리에 상태 f로 보관', r.db.join() === 'f:big1' && !r.stored && r.q === 0 && r.memOnly === 0 && saved.ok1 && saved.ok1.n === 1, JSON.stringify(r.db) + ' memOnly ' + r.memOnly);
    ok('화면에 계속 보이고 "모두 저장됨"이라고 하지 않음', /저장 못 한 말 1줄/.test(r.box) && !/메모리에만/.test(r.box) && /저장 못 한 말/.test(r.pill) && !/모두 저장됨/.test(r.st), r.box.slice(0, 80));
    await p.reload(); await wait(p, 2500);
    const r1 = await p.evaluate(() => ({ f: failGet().map(x => x.text), box: document.getElementById('failBox').textContent }));
    ok('창을 닫았다 열어도 저장 못 한 말이 남아 있음 (두 번째 자리에서 되살림)', r1.f.includes('아주 긴 말 원문') && /저장 못 한 말 1줄/.test(r1.box), JSON.stringify(r1.f));
    await p.evaluate(() => { window.__failFull = false; failAdd(failGet(), ''); });
    const r2 = await p.evaluate(U => JSON.parse(localStorage.getItem('t_fail:' + U) || '[]').map(x => x.text), U);
    ok('저장 공간이 되살아나면 localStorage에도 보관', r2.includes('아주 긴 말 원문'));
    // 두 자리 모두 못 쓰는 경우
    await p.evaluate(() => { window.__failFull = true; qdb.put = async () => false; failAdd([{ uid: 'big2', name: '대장', text: '어디에도 못 적은 말', t: new Date().toISOString() }], '100만 자가 넘어 서버가 받지 않음'); });
    await wait(p, 300);
    const r3 = await p.evaluate(() => ({ memOnly: failMemOnly(), box: document.getElementById('failBox').textContent, st: document.getElementById('sendSt').textContent }));
    ok('두 자리 모두 못 쓰면 "이 기기 어디에도 저장되지 않고 메모리에만"이라고 따로 알림', r3.memOnly === 1 && /1줄이 이 기기 어디에도 저장되지 않고 이 창의 메모리에만/.test(r3.box) && /메모리에만/.test(r3.st), r3.box.slice(0, 90) + ' / ' + r3.st);
    const asked = await p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    ok('그 상태로 창을 닫으려 하면 브라우저가 한 번 물어봄', asked === true);
    ok('화면 오류 없음 (④)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('5', async () => { // ⑤ 못 보낸 말 5,003줄 (서버 장애 중) → 한 줄도 버리지 않음. 다시 보내기 도중 창이 닫혀도 사본이 남지 않음
    const t0 = Date.now() - 3600000; const items = Array.from({ length: 5003 }, (_, i) => ({ uid: 'q' + i, name: '대장', text: '말 ' + i, t: new Date(t0 + i * 100).toISOString() }));
    let down = true;
    const { p, saved, errs } = await open(b, { store: { ['t_q:' + U]: JSON.stringify(items) }, handle: a => (a === 'lines' && down ? { ok: false, error: '서버 점검 (가짜)' } : null) });
    await wait(p, 3000);
    const r = await p.evaluate(async U => ({ q: queue.length, f: failGet().map(x => x.uid), box: document.getElementById('failBox').textContent, db: (await qdb.all(U)).filter(x => x.st === 'f').map(x => x.uid).sort() }), U);
    ok('5,000줄을 넘은 3줄은 버리지 않고 "저장 못 한 말"로 (두 번째 자리에도 상태 f)', r.q === 5000 && r.f.join() === 'q0,q1,q2' && /5,000줄을 넘어/.test(r.box) && r.db.join() === 'q0,q1,q2', 'q=' + r.q + ' fail=' + r.f.join() + ' db=' + r.db.join());
    down = false; await wait(p, 22000);
    const r2 = await p.evaluate(() => ({ q: queue.length }));
    ok('서버가 돌아오면 5,000줄 모두 저장', r2.q === 0 && Object.keys(saved).length === 5000, 'saved=' + Object.keys(saved).length);
    // 다시 보내기를 누른 직후(서버 확인 전) 창이 닫힘 → 목록에 사본이 남은 상태를 만든다
    down = true;
    await p.evaluate(U => { const keep = localStorage.getItem('t_fail:' + U); [...document.querySelectorAll('#failBox button')].find(x => /다시 보내기/.test(x.textContent)).click(); localStorage.setItem('t_fail:' + U, keep); }, U);
    await wait(p, 500); await p.reload(); await wait(p, 2000);
    const r3 = await p.evaluate(async U => ({ q: queue.map(x => x.uid).sort(), f: failGet().length, db: (await qdb.all(U)).map(x => x.st + ':' + x.uid).sort() }), U);
    ok('다시 보내기 도중 창이 닫혀도 말은 대기열에 남음 (두 번째 자리는 상태 q로 한 번에 바뀜)', r3.q.join() === 'q0,q1,q2' && r3.db.join() === 'q:q0,q:q1,q:q2', JSON.stringify(r3));
    down = false; await wait(p, 6000);
    const r4 = await p.evaluate(async U => ({ f: failGet().length, ls: localStorage.getItem('t_fail:' + U), db: (await qdb.all(U)).length, st: document.getElementById('sendSt').textContent }), U);
    ok('입력 5,003 = 저장 5,003, 중복 저장 0. 저장이 확인되면 목록의 사본도 걷음', Object.keys(saved).length === 5003 && r4.f === 0 && !r4.ls && r4.db === 0 && /모두 저장됨/.test(r4.st), 'saved=' + Object.keys(saved).length + ' ' + JSON.stringify(r4));
    ok('화면 오류 없음 (⑤)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('6', async () => { // ⑥ localStorage에 대기열을 못 씀 → 두 번째 자리에 발언 하나씩 보관 → 새로 고침 뒤 되살려 보냄. 두 탭이 동시에 써도 서로 덮어쓰지 않음
    let down = true;
    const full = () => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('t_q:')) throw new Error('QuotaExceededError'); return o.call(this, k, v); }; };
    const { c, p, saved, errs } = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null), initScript: full });
    await wait(p, 1500);
    const p2 = await c.newPage(); const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.addInitScript(full); await p2.goto('https://site.test/T/'); await wait(p2, 1500);
    // 두 탭이 번갈아 20줄씩, 같은 순간에 쓴다
    await Promise.all([p.evaluate(() => { for (let i = 0; i < 20; i++) pushLine('첫째 탭 말 ' + i); }), p2.evaluate(() => { for (let i = 0; i < 20; i++) pushLine('둘째 탭 말 ' + i); })]);
    await wait(p, 1200);
    const r = await p.evaluate(async U => ({ ls: localStorage.getItem('t_q:' + U), idb: (await qdb.all(U)).filter(x => x.st === 'q').map(x => x.text), mem: qMemOnly(), pill: document.getElementById('sendPill').textContent }), U);
    ok('localStorage가 꽉 찬 두 탭: 두 번째 자리에 40줄 모두 (서로 덮어쓰지 않음)', !r.ls && r.idb.length === 40 && r.idb.filter(t => /첫째/.test(t)).length === 20 && r.mem === 0 && !/메모리에만/.test(r.pill), r.idb.length + '줄 ' + r.pill);
    await p2.close();                                                       // 둘째 탭은 보내지 못한 채 닫힘
    await p.reload(); await wait(p, 1500);
    ok('새로 고침하면 닫힌 탭의 말까지 되살림', (await p.evaluate(() => queue.length)) === 40);
    down = false; await wait(p, 6000);
    const st = texts(saved);
    ok('40줄 모두 서버에 한 번씩 저장', st.filter(t => /탭 말/.test(t)).length === 40 && Object.values(saved).every(x => x.n === 1), st.length + '줄');
    const left = await p.evaluate(async U => (await qdb.all(U)).length, U);
    ok('저장된 뒤에는 두 번째 자리도 비움', left === 0, 'left=' + left);
    // 두 자리 모두 못 쓰는 경우: 메모리에만 있다고 알림
    down = true;
    await p.evaluate(() => { qdb.put = async () => false; pushLine('어디에도 저장 못 한 말'); }); await wait(p, 300);
    const m = await p.evaluate(() => ({ mem: qMemOnly(), pill: document.getElementById('sendPill').textContent, title: document.getElementById('sendPill').title }));
    ok('두 자리 모두 못 쓰면 "기기에 저장 안 됨 · 메모리에만 1줄"', m.mem === 1 && /기기에 저장 안 됨 · 메모리에만 1줄/.test(m.pill) && /창을 닫거나 새로 고치면 사라져요/.test(m.title), m.pill);
    ok('화면 오류 없음 (⑥)', !errs.length && !errs2.length, errs.concat(errs2).join(' | '));
    await p.context().close();
  });
  await part('6b', async () => { // 예전 판(v1)의 두 번째 자리 자료(방마다 배열 하나)를 새 구조로 옮김 + 쓰는 도중 새로 고침
    let down = true;
    const OT = 'https://script.google.com/macros/s/OTHERroom99/exec';
    // 화면 코드가 돌기 전에 예전 구조(v1)로 자료를 심는다. 같은 DB를 여는 요청은 차례대로 처리되므로, 화면이 v2로 여는 것은 이 뒤에 돈다
    const seed = '(' + ((U, OT) => { if (sessionStorage.getItem('__v1')) return; sessionStorage.setItem('__v1', '1'); const r = indexedDB.open('trpg_q', 1); r.onupgradeneeded = () => r.result.createObjectStore('q');
      r.onsuccess = () => { const d = r.result, t = d.transaction('q', 'readwrite'); t.objectStore('q').put([{ uid: 'old1', name: '대장', session: '1', rv: '1', t: '2026-11-20T10:00:00.000Z', text: '예전 판이 남긴 말' }], 't_q:' + U);
        t.objectStore('q').put([{ uid: 'oldX', name: '대장', session: '1', rv: '1', t: '2026-11-20T10:00:01.000Z', text: '다른 방에 남긴 말' }], 't_q:' + OT); t.oncomplete = () => d.close(); }; }).toString() + ')(' + JSON.stringify(U) + ',' + JSON.stringify(OT) + ')';
    const { c, p, saved, calls, errs } = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null), initScript: seed, store: { t_rooms: JSON.stringify([{ name: '테스트용 채널', rule: 'coc', url: U, pw: 'pw' }, { name: '다른 방', rule: 'coc', url: OT, pw: 'pwO' }]) } });
    await wait(p, 2500);
    const r = await p.evaluate(async () => ({ q: queue.map(x => x.text), all: (await qdb.all()).map(x => x.room.slice(-18) + ':' + x.st + ':' + x.uid).sort(), other: document.getElementById('otherQ').textContent }));
    ok('예전 판 자료를 발언 하나씩으로 옮겨 되살림 (기존 데이터 호환)', r.q.includes('예전 판이 남긴 말') && r.all.length === 2, JSON.stringify(r.all));
    // 쓰는 도중 새로 고침: 넣자마자(기다리지 않고) 새로 고친다
    await p.evaluate(() => { pushLine('넣자마자 새로 고친 말'); location.reload(); }); await wait(p, 2500);
    ok('두 번째 자리에 쓰는 도중 새로 고쳐도 localStorage에 먼저 적혀 있어 남음', (await p.evaluate(() => queue.map(x => x.text))).includes('넣자마자 새로 고친 말'));
    down = false; await wait(p, 22000);
    const toO = calls.filter(x => x.url === OT && x.a === 'lines');
    ok('두 번째 자리에만 있던 다른 방의 말도 그 방 주소로 보냄 (그 방 비밀번호로)', saved.oldX && saved.oldX.url === OT && toO.length >= 1 && toO.every(x => x.body.pw === 'pwO') && saved.old1 && saved.old1.url === U, JSON.stringify(Object.keys(saved)));
    ok('보낸 뒤 두 번째 자리가 비고 안내도 사라짐', (await p.evaluate(async () => (await qdb.all()).length)) === 0 && await p.evaluate(() => document.getElementById('otherQ').classList.contains('hide')));
    ok('화면 오류 없음 (⑥b)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await part('7', async () => { // ⑦ 다른 방 두 곳: 비밀번호 없는 방(X) 때문에 비밀번호 있는 방(Y)의 말이 밀리지 않음
    const X = 'https://script.google.com/macros/s/AAAnoCreds1/exec', Y = 'https://script.google.com/macros/s/ZZZhasPw123/exec', now = new Date().toISOString();
    const { p, saved, calls, errs } = await open(b, { store: { ['t_q:' + X]: JSON.stringify([{ uid: 'x1', name: '대장', text: 'X 방 말', t: now }]), ['t_q:' + Y]: JSON.stringify([{ uid: 'y1', name: '대장', text: 'Y 방 말', t: now }]),
      t_rooms: JSON.stringify([{ name: '테스트용 채널', rule: 'coc', url: U, pw: 'pw' }, { name: '다른 방 Y', rule: 'coc', url: Y, pw: 'pwY' }]) } });
    await wait(p, 32000);
    const toX = calls.filter(c => c.url === X && c.a === 'lines'), toY = calls.filter(c => c.url === Y && c.a === 'lines');
    const r = await p.evaluate(([X, Y]) => ({ x: JSON.parse(localStorage.getItem('t_q:' + X) || '[]').length, y: JSON.parse(localStorage.getItem('t_q:' + Y) || '[]').length, box: document.getElementById('otherQ').textContent }), [X, Y]);
    ok('비밀번호 없는 방에는 보내지 않고 보관 (지금 방 비밀번호를 대신 쓰지 않음)', toX.length === 0 && r.x === 1 && /다시 들어가/.test(r.box));
    ok('그 방 때문에 다른 방의 말이 밀리지 않음', saved.y1 && saved.y1.n === 1 && r.y === 0 && toY.every(c => c.body.pw === 'pwY'), 'Y로 보낸 요청 ' + toY.length + '번');
    ok('화면 오류 없음 (⑦)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await b.close(); done();
})();
