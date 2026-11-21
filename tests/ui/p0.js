// 발언 원문 보존: 확정 전 글, 끊긴 동안의 소리, 누락 가능 구간, 기기 저장 실패, 5,000줄 초과, 다른 방 대기열
const { chromium } = require('playwright'); const { open, ok, done, U } = require('./harness.js');
const wait = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const b = await chromium.launch();
  { // ① 확정 전 글 + ② 끊긴 동안의 소리 이어 보내기
    const { p, saved, errs } = await open(b); await wait(p, 1200);
    await p.click('#micBtn'); await wait(p, 300);
    await p.evaluate(() => __ws[0]._open()); await wait(p, 200);
    await p.evaluate(() => { __ws[0]._msg({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: '확정된 말' }] } }); __ws[0]._msg({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: '지하실 문을 열어 본다' }] } }); });
    await wait(p, 100);
    const sentBefore = await p.evaluate(() => __ws[0].sent.filter(x => /^r\d+c/.test(x)));
    await p.evaluate(() => __ws[0]._drop(1006)); await wait(p, 5000);
    const texts = Object.values(saved).map(x => x.text);
    ok('연결이 끊길 때 확정 전 글을 한 줄로 저장', texts.includes('지하실 문을 열어 본다') && texts.includes('확정된 말'), JSON.stringify(texts));
    await wait(p, 600);        // 다시 연결을 시도하는 중 (아직 열리지 않음): 그동안의 소리는 메모리에
    const n = await p.evaluate(() => ({ ws: __ws.length, buf: abuf.length, lost: abufLost }));
    ok('끊긴 동안의 소리를 메모리에 모음', n.ws >= 2 && n.buf > 20 && !n.lost, JSON.stringify(n));
    await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 300);
    const s2 = await p.evaluate(() => __ws[__ws.length - 1].sent.filter(x => /^r\d+c/.test(x)));
    const rid = s2[0].split('c')[0], seq = s2.map(x => Number(x.split('c')[1]));
    ok('다시 연결되면 새 녹음의 첫 조각(머리말)부터 빠짐없이 순서대로 보냄', rid !== sentBefore[0].split('c')[0] && seq[0] === 0 && seq.every((x, i) => x === i) && s2.every(x => x.startsWith(rid + 'c')), s2.slice(0, 3).join(',') + ' … ' + s2.length + '조각');
    const g = await p.evaluate(() => ({ gaps: gapGet().length, q: queue.map(x => x.text) }));
    ok('90초 안에 이어졌으면 누락 구간으로 적지 않음', g.gaps === 0 && !g.q.some(t => /받아쓰기 끊김/.test(t)));
    // 받아쓰기를 끌 때 남은 확정 전 글
    await p.evaluate(() => __ws[__ws.length - 1]._msg({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: '끄기 직전에 한 말' }] } }));
    await p.click('#micBtn'); await wait(p, 5500);
    ok('받아쓰기를 끌 때 확정 전 글도 저장', Object.values(saved).some(x => x.text === '끄기 직전에 한 말'));
    ok('화면 오류 없음 (①②)', !errs.length, errs.join(' | '));
    await p.context().close();
  }
  { // ③ 90초 넘게 끊김 → 누락 가능 구간을 적고 대화에도 안내 줄
    const real = ms => new Promise(r => setTimeout(r, ms));      // 가짜 시계와 별개로, 실제 통신(가짜 서버 응답)이 끝나기를 기다린다
    const { p, saved, errs } = await open(b, { clock: true }); await real(800); await p.clock.runFor(1500); await real(500);
    await p.click('#micBtn'); await real(600); await p.clock.runFor(300); await real(300);
    await p.evaluate(() => __ws[0]._open()); await p.clock.runFor(300);
    await p.evaluate(() => __ws[0]._drop(1006));
    for (let i = 0; i < 10; i++) { await p.clock.runFor(10000); await real(150); }
    const mid = await p.evaluate(() => ({ lost: abufLost, buf: abuf.length, ws: __ws.length }));
    ok('90초를 넘기면 모아 둔 소리를 버림 (메모리에 오래 두지 않음)', mid.lost && mid.buf === 0, JSON.stringify(mid));
    await p.evaluate(() => __ws[__ws.length - 1]._open()); for (let i = 0; i < 4; i++) { await p.clock.runFor(2500); await real(300); }
    const r = await p.evaluate(() => ({ gaps: gapGet(), box: document.getElementById('gapBox').textContent, hidden: document.getElementById('gapBox').classList.contains('hide'), st: document.getElementById('sendSt').textContent, first: __ws[__ws.length - 1].sent.find(x => /^r\d+c/.test(x)) }));
    const line = Object.values(saved).map(x => x.text).find(t => /^※ 받아쓰기 끊김/.test(t)) || '';
    ok('누락 가능 구간을 시각과 함께 적음', r.gaps.length === 1 && r.gaps[0].sec >= 95 && !r.hidden && /빠졌을 수 있는 구간 1곳/.test(r.box), JSON.stringify(r.gaps[0]));
    ok('대화에도 "※ 받아쓰기 끊김" 줄을 남김', /약 1분 4\d초/.test(line), line);
    ok('"모두 저장됨" 옆에 누락 구간을 따로 표시', /빠졌을 수 있는 구간 1곳/.test(r.st), r.st);
    ok('새 녹음기로 다시 시작', /c0$/.test(r.first || ''), r.first);
    ok('화면 오류 없음 (③)', !errs.length, errs.join(' | '));
    await p.context().close();
  }
  { // ④ 서버가 거절한 말 + 실패 목록을 기기에 저장하지 못함 → 메모리에 남고 화면에 계속 보임 → 저장이 되살아나면 보관
    const now = new Date().toISOString();
    const { p, saved, errs } = await open(b, { store: { ['t_q:' + U]: JSON.stringify([{ uid: 'big1', name: '대장', text: '아주 긴 말 원문', t: now }, { uid: 'ok1', name: '대장', text: '보통 말', t: now }]) },
      initScript: () => { const o = Storage.prototype.setItem; window.__failFull = true; Storage.prototype.setItem = function (k, v) { if (window.__failFull && String(k).startsWith('t_fail:')) throw new Error('QuotaExceededError'); return o.call(this, k, v); }; } });
    await wait(p, 6000);
    const r = await p.evaluate(U => ({ mem: failMem.map(x => x.text), stored: localStorage.getItem('t_fail:' + U), q: queue.length, box: document.getElementById('failBox').textContent, pill: document.getElementById('sendPill').textContent, st: document.getElementById('sendSt').textContent }), U);
    ok('실패 목록 저장이 실패해도 원문은 메모리에 남음', r.mem.includes('아주 긴 말 원문') && !r.stored && r.q === 0 && saved.ok1 && saved.ok1.n === 1, JSON.stringify(r.mem));
    ok('화면에 계속 보이고 "모두 저장됨"이라고 하지 않음', /저장 못 한 말 1줄/.test(r.box) && /메모리에만/.test(r.box) && /저장 못 한 말/.test(r.pill) && !/모두 저장됨/.test(r.st), r.box.slice(0, 80));
    await p.evaluate(() => { window.__failFull = false; saveQueue(); });
    const r2 = await p.evaluate(U => ({ mem: failMem.length, stored: JSON.parse(localStorage.getItem('t_fail:' + U) || '[]').map(x => x.text) }), U);
    ok('저장 공간이 되살아나면 기기에 보관', r2.mem === 0 && r2.stored.includes('아주 긴 말 원문'));
    ok('화면 오류 없음 (④)', !errs.length, errs.join(' | '));
    await p.context().close();
  }
  { // ⑤ 못 보낸 말 5,003줄 (서버 장애 중) → 한 줄도 버리지 않음
    const t0 = Date.now() - 3600000; const items = Array.from({ length: 5003 }, (_, i) => ({ uid: 'q' + i, name: '대장', text: '말 ' + i, t: new Date(t0 + i * 100).toISOString() }));
    let down = true;
    const { p, saved, errs } = await open(b, { store: { ['t_q:' + U]: JSON.stringify(items) }, handle: a => (a === 'lines' && down ? { ok: false, error: '서버 점검 (가짜)' } : null) });
    await wait(p, 3000);
    const r = await p.evaluate(() => ({ q: queue.length, f: failGet().map(x => x.uid), box: document.getElementById('failBox').textContent }));
    ok('5,000줄을 넘은 3줄은 버리지 않고 "저장 못 한 말"로', r.q === 5000 && r.f.join() === 'q0,q1,q2' && /5,000줄을 넘어/.test(r.box), 'q=' + r.q + ' fail=' + r.f.join());
    down = false; await wait(p, 22000);
    const r2 = await p.evaluate(() => ({ q: queue.length, hasBtn: /다시 보내기/.test(document.getElementById('failBox').textContent) }));
    ok('서버가 돌아오면 5,000줄 모두 저장', r2.q === 0 && Object.keys(saved).length === 5000, 'saved=' + Object.keys(saved).length);
    await p.evaluate(() => [...document.querySelectorAll('#failBox button')].find(x => /다시 보내기/.test(x.textContent)).click()); await wait(p, 3000);
    const r3 = await p.evaluate(() => ({ f: failGet().length, st: document.getElementById('sendSt').textContent }));
    ok('옮겨 둔 3줄도 [다시 보내기]로 저장 → 입력 5,003 = 저장 5,003, 중복 0', Object.keys(saved).length === 5003 && Object.values(saved).every(x => x.n === 1) && r3.f === 0, 'saved=' + Object.keys(saved).length);
    ok('화면 오류 없음 (⑤)', !errs.length, errs.join(' | '));
    await p.context().close();
  }
  { // ⑥ localStorage에 대기열을 못 씀 → 두 번째 자리(IndexedDB)에 보관 → 새로 고침 뒤 되살려 보냄
    let down = true;
    const { p, saved, errs } = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null) });
    await p.addInitScript(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('t_q:')) throw new Error('QuotaExceededError'); return o.call(this, k, v); }; });
    await p.reload(); await wait(p, 1500);
    await p.evaluate(() => { pushLine('저장 공간이 꽉 찼을 때 한 말'); }); await wait(p, 800);
    const r = await p.evaluate(async U => ({ ls: localStorage.getItem('t_q:' + U), idb: (await qdb.get('t_q:' + U)).map(x => x.text), pill: document.getElementById('sendPill').textContent }), U);
    ok('localStorage가 꽉 차도 두 번째 자리에 보관', !r.ls && r.idb.includes('저장 공간이 꽉 찼을 때 한 말') && !/기기 보관 실패/.test(r.pill), JSON.stringify(r.idb) + ' ' + r.pill);
    await p.reload(); await wait(p, 1500); down = false; await wait(p, 6000);
    ok('새로 고침 뒤 되살려서 서버에 저장', Object.values(saved).some(x => x.text === '저장 공간이 꽉 찼을 때 한 말' && x.n === 1), JSON.stringify(Object.values(saved).map(x => x.text)));
    const left = await p.evaluate(async U => (await qdb.get('t_q:' + U)).length, U);
    ok('저장된 뒤에는 두 번째 자리도 비움', left === 0, 'left=' + left);
    ok('화면 오류 없음 (⑥)', !errs.length, errs.join(' | '));
    await p.context().close();
  }
  { // ⑦ 다른 방 두 곳: 비밀번호 없는 방(X) 때문에 비밀번호 있는 방(Y)의 말이 밀리지 않음
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
  }
  await b.close(); done();
})();
