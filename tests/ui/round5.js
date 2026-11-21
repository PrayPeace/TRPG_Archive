// 5차 검토에서 재현된 결함과 "추가 확인" 항목 (화면 시험: 실제 브라우저 + 가짜 서버·가짜 Deepgram·가짜 녹음기).
// 여기서 통과한 것은 "화면 코드가 이렇게 동작한다"까지다. 실제 음성이 글로 맞게 적히는지는 이 시험으로 알 수 없다.
// 사용: node tests/ui/round5.js [stop,idb,next,stat]
const { chromium } = require('playwright'); const { open, ok, done, U, V, baseData } = require('./harness.js');
const wait = (p, ms) => p.waitForTimeout(ms);
const only = process.argv[2] || '';
const part = async (tag, fn) => { if (only && !only.split(',').includes(tag)) return; try { await fn(); } catch (e) { ok('[' + tag + '] 시험이 끝까지 돎', false, String(e && e.stack || e).slice(0, 400)); } };
const R = (final, text, start, dur, words) => ({ type: 'Results', is_final: final, start, duration: dur, channel: { alternatives: [Object.assign({ transcript: text }, words ? { words } : {})] } });
const texts = saved => Object.values(saved).map(x => x.text);
const micOn = async p => { await p.click('#micBtn'); await wait(p, 300); await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 600); };
const sentOf = p => p.evaluate(() => __ws[__ws.length - 1].sent.slice());
const gaps = p => p.evaluate(() => gapGet().map(g => ({ sec: g.sec, why: g.why })));
const N = p => p.evaluate(() => statLoad().n);
// 같은 브라우저의 둘째 탭 (같은 저장소를 쓰고, 같은 방에 들어와 있음)
const tab2 = async c => { const p2 = await c.newPage(); await p2.addInitScript(U => { sessionStorage.setItem('t_in', U); sessionStorage.setItem('t_enter', '1'); }, U); await p2.goto('https://site.test/T/'); await p2.waitForTimeout(1500); return p2; };
(async () => {
  const b = await chromium.launch();

  await part('stop', async () => {
    // [문제 A] 종료 신호(CloseStream) 보내기가 실패하면 다시 보낸다 (보내기 전에 "보냈다"고 적지 않는다)
    let x = await open(b), p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(() => { __ws[0].failText = 3; });
    await p.click('#micBtn'); await wait(p, 150);
    const a1 = await p.evaluate(() => ({ close: __ws[0].sent.filter(s => /CloseStream/.test(s)).length, flag: !!__ws[0]._closeSent, fin: __ws[0].sent.some(s => /F$/.test(s)) }));
    ok('[A] 종료 신호 보내기가 실패한 동안에는 "보냈다"고 적지 않음', a1.close === 0 && a1.flag === false && a1.fin, JSON.stringify(a1));
    await wait(p, 700);
    const a2 = await p.evaluate(() => { const s = __ws[0].sent; return { close: s.filter(t => /CloseStream/.test(t)).length, flag: !!__ws[0]._closeSent, after: s.findIndex(t => /CloseStream/.test(t)) > s.map((t, i) => /^r\d+c/.test(t) ? i : -1).filter(i => i >= 0).pop(), fails: statLoad().n.closeFail }; });
    ok('[A] 실패하면 0.1초 뒤 다시 보내서, 성공한 뒤에만 한 번 적음 (마지막 조각 뒤)', a2.close === 1 && a2.flag && a2.after && a2.fails === 3, JSON.stringify(a2));
    await p.evaluate(() => __ws[0]._drop(1000)); await wait(p, 300); await x.c.close();
    // 끝내 보내지 못하면: 20번 뒤 종료 실패로 마무리하고, 확인되지 않은 구간을 적는다
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(() => { __ws[0].failText = 9999; rec.t0 -= 6000; });
    await p.click('#micBtn'); await wait(p, 3200);
    const a3 = await p.evaluate(() => ({ dead: !!__ws[0]._dead, flag: !!__ws[0]._closeSent, rec: rec === null, fails: statLoad().n.closeFail, mic: document.getElementById('micTxt').textContent }));
    const g3 = await gaps(p);
    ok('[A] 종료 신호를 끝내 보내지 못하면 20번 뒤 종료 실패로 마무리 (멈춰 있지 않음)', a3.dead && !a3.flag && a3.rec && a3.fails === 20 && /시작/.test(a3.mic), JSON.stringify(a3));
    ok('[A] 그때 받아 적혔는지 확인하지 못한 구간을 누락 가능 구간으로 적음', g3.length === 1 && g3[0].sec >= 6 && /확인 못 함/.test(g3[0].why), JSON.stringify(g3));
    ok('화면 오류 없음 (A)', !x.errs.length, x.errs.join(' | ')); await x.c.close();

    // [문제 B] Deepgram이 처리 위치를 한 번도 알려 주지 않은 채 끔 → 녹음 구간 전체를 누락 가능 구간으로
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(() => { rec.t0 -= 10000; });                      // 10초 분량을 보냈지만 Results가 한 번도 오지 않은 상황
    await p.click('#micBtn'); await wait(p, 300);
    await p.evaluate(() => __ws[0]._drop(1000)); await wait(p, 400);
    const gB = await gaps(p), pill = await p.evaluate(() => document.getElementById('sendSt').textContent + ' / ' + document.getElementById('sendPill').textContent);
    ok('[B] (재현 수정) 처리 확인을 한 번도 받지 못하고 끄면 누락 가능 구간 1건 (약 10초)', gB.length === 1 && gB[0].sec >= 10 && gB[0].sec <= 12 && /확인 못 함/.test(gB[0].why), JSON.stringify(gB));
    ok('[B] 화면에도 빠졌을 수 있는 구간으로 보이고, 대화에 "※ 받아쓰기 끊김" 줄을 남김', /구간 1곳/.test(pill) && (await p.evaluate(() => queue.concat([]).some(q => /받아쓰기 끊김/.test(q.text))) || texts(x.saved).some(t => /받아쓰기 끊김/.test(t))), pill);
    await x.c.close();
    // 대조: Deepgram이 끝까지 처리했다고 알려 왔으면 적지 않음. 3초 미만의 확인 안 된 녹음도 적지 않음(짧게 켰다 끈 경우)
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(Rr => { rec.t0 -= 10000; __ws[0]._msg(Rr); }, R(true, '끝까지 받아 적힌 말', 0, 10.5));
    await p.click('#micBtn'); await wait(p, 300); await p.evaluate(() => __ws[0]._drop(1000)); await wait(p, 400);
    ok('[B] 대조: 끝까지 처리했다고 알려 왔으면 누락 구간을 적지 않음', (await gaps(p)).length === 0, JSON.stringify(await gaps(p)));
    await micOn(p); await p.click('#micBtn'); await wait(p, 300); await p.evaluate(() => __ws[__ws.length - 1]._drop(1000)); await wait(p, 400);
    ok('[B] 대조: 1초쯤 켰다 끈 것(확인 안 됨, 3초 미만)은 구간으로 적지 않음', (await gaps(p)).length === 0, JSON.stringify(await gaps(p)));
    ok('화면 오류 없음 (B)', !x.errs.length, x.errs.join(' | ')); await x.c.close();

    // 멈춘 뒤 마지막 조각이 0.7초보다 늦게 오는 경우: 조각을 기다렸다가 그 뒤에 종료 신호
    x = await open(b, { initScript: () => { window.__finalDelay = 1200; } }); p = x.p; await wait(p, 1200); await micOn(p);
    await p.click('#micBtn'); await wait(p, 900);
    const c1 = await sentOf(p);
    ok('마지막 조각이 아직 안 왔으면(0.9초) 종료 신호를 먼저 보내지 않음', !c1.some(s => /CloseStream/.test(s)) && !c1.some(s => /F$/.test(s)), c1.slice(-3).join(','));
    await wait(p, 700);
    const c2 = await sentOf(p), iF = c2.findIndex(s => /F$/.test(s)), iC = c2.findIndex(s => /CloseStream/.test(s));
    ok('1.2초 뒤에 온 마지막 조각을 보낸 다음에 종료 신호', iF >= 0 && iC > iF && c2.filter(s => /CloseStream/.test(s)).length === 1, c2.slice(-3).join(','));
    await p.evaluate(() => __ws[0]._drop(1000)); await wait(p, 300); await x.c.close();
    // 녹음기가 멈춤 신호도 마지막 조각도 주지 않는 경우: 2초 뒤 닫고, 그 뒤에 온 조각은 보낸 척하지 않고 센다
    x = await open(b, { initScript: () => { window.__noFinal = true; } }); p = x.p; await wait(p, 1200); await micOn(p);
    await p.click('#micBtn'); await wait(p, 1500);
    ok('멈춤 신호가 없어도 1.5초까지는 기다림', !(await sentOf(p)).some(s => /CloseStream/.test(s)));
    await wait(p, 900);
    const d1 = await p.evaluate(() => { const r = rec; r.m.ondataavailable({ data: { size: 10, tag: 'LATE' } }); return { close: __ws[0].sent.filter(s => /CloseStream/.test(s)).length, late: __ws[0].sent.includes('LATE'), n: statLoad().n }; });
    ok('2초 뒤에는 기다리지 않고 종료 신호를 보냄 (stopForced로 셈)', d1.close === 1 && d1.n.stopForced === 1, JSON.stringify({ close: d1.close, forced: d1.n.stopForced }));
    ok('종료 신호 뒤에 온 조각은 소켓에 넣지 않고 lateTail로 셈 (보낸 척하지 않음)', !d1.late && d1.n.lateTail === 1, JSON.stringify({ late: d1.late, lateTail: d1.n.lateTail }));
    await p.evaluate(() => __ws[0]._drop(1000)); await wait(p, 300); await x.c.close();

    // 정상 종료 중 네트워크가 끊김 (Deepgram이 닫아 주지 않음): 기다리다가 스스로 마무리
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(Rr => { __ws[0]._msg(Rr[0]); __ws[0]._msg(Rr[1]); rec.t0 -= 8000; }, [R(true, '끊기기 전에 확정된 말', 0, 1), R(false, '끄는 중에 하던 말', 1, 0.5)]);
    await p.click('#micBtn'); await wait(p, 6200);
    const e1 = await p.evaluate(() => ({ dead: !!__ws[0]._dead, rec: rec === null, mic: document.getElementById('micTxt').textContent }));
    const gE = await gaps(p);
    ok('끄는 중 연결이 죽어도 5초 남짓 뒤 스스로 마무리하고 확정 전 글을 "(확정 전)"으로 저장', e1.dead && e1.rec && texts(x.saved).includes('끄는 중에 하던 말 (확정 전)') && texts(x.saved).includes('끊기기 전에 확정된 말'), JSON.stringify(e1) + JSON.stringify(texts(x.saved)));
    ok('그때 받아 적히지 않은 꼬리(약 7초)를 누락 가능 구간으로 적음', gE.length === 1 && gE[0].sec >= 5 && /받아 적지 못함/.test(gE[0].why), JSON.stringify(gE));
    ok('화면 오류 없음 (끄는 중 끊김)', !x.errs.length, x.errs.join(' | ')); await x.c.close();

    // 끄자마자 다시 켬: 앞의 것을 먼저 마무리(확정 전 글 저장), 옛 연결의 늦은 글은 쓰지 않음, 새 연결은 정상
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(Rr => __ws[0]._msg(Rr), R(false, '끄기 직전의 말', 0, 0.5));
    await p.click('#micBtn'); await wait(p, 60); await p.click('#micBtn'); await wait(p, 500);
    const f1 = await p.evaluate(() => ({ ws: __ws.length, old: !!__ws[0]._dead, cur: __ws[__ws.length - 1] !== __ws[0] }));
    await p.evaluate(Rr => { __ws[0]._msg(Rr); }, R(true, '끄기 직전의 말 끝까지', 0, 1));          // 옛 연결에서 늦게 온 확정 글
    await p.evaluate(() => __ws[__ws.length - 1]._open()); await wait(p, 500);
    await p.evaluate(Rr => ws._msg(Rr), R(true, '다시 켠 뒤의 말', 0, 1)); await wait(p, 5500);
    const tf = texts(x.saved);
    ok('끄자마자 다시 켜면 앞의 연결을 먼저 마무리하고 새 연결을 엶', f1.ws === 2 && f1.old && f1.cur, JSON.stringify(f1));
    ok('앞의 확정 전 글은 한 번만 저장되고(옛 연결의 늦은 확정 글로 또 적지 않음), 새 연결의 말은 정상 저장', tf.filter(t => /끄기 직전의 말/.test(t)).length === 1 && tf.includes('끄기 직전의 말 (확정 전)') && tf.includes('다시 켠 뒤의 말'), JSON.stringify(tf));
    const f2 = await p.evaluate(() => ({ running: running, recW: rec && rec.w === ws, sent: __ws[__ws.length - 1].sent.filter(s => /^r\d+c/.test(s)).length }));
    ok('새 연결에 새 녹음이 정상으로 나감', f2.running && f2.recW && f2.sent >= 3, JSON.stringify(f2));
    ok('화면 오류 없음 (다시 켬)', !x.errs.length, x.errs.join(' | ')); await x.c.close();

    // 확정한 곳과 일부만 겹치는 결과, 확정 위치가 과거로 가는 결과 (글이 아니라 소리 위치로 판단)
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    const W = (w, s) => ({ word: w, punctuated_word: w, start: s, end: s + 0.4 });
    await p.evaluate(Rr => { Rr.forEach(m => __ws[0]._msg(m)); }, [
      R(true, '가 나 다', 0, 2, [W('가', 0.1), W('나', 0.8), W('다', 1.5)]),
      R(true, '다 라 마', 1.4, 2.1, [W('다', 1.5), W('라', 2.2), W('마', 2.9)]),       // 1.4~3.5초: '다'는 이미 확정한 0~2초 안
      R(true, '바 사', 3.0, 2.0),                                                        // 3.0~5.0초: 겹치지만 낱말 시각이 없음 → 지우지 않고 통째로
      R(true, '옛날 위치의 글', 1.0, 1.0),                                               // 1.0~2.0초: 이미 확정한 곳 → 버림, 확정 위치는 뒤로 가지 않음
      R(true, '가 나 다', 5.0, 2.0, [W('가', 5.1), W('나', 5.8), W('다', 6.4)])        // 글은 첫 줄과 같지만 다른 때 한 말 → 저장
    ]);
    await wait(p, 5500);
    const th = texts(x.saved), fin = await p.evaluate(() => __ws[0]._final), nn = await N(p);
    ok('일부만 겹친 결과: 확정한 곳 뒤의 낱말만 남김 ("다 라 마" → "라 마")', th.includes('라 마') && !th.includes('다 라 마'), JSON.stringify(th));
    ok('낱말 시각이 없으면 지우지 않고 통째로 둠 (빠지는 것보다 겹치는 편)', th.includes('바 사') && nn.overlapKept === 1 && nn.overlapCut === 1, JSON.stringify({ kept: nn.overlapKept, cut: nn.overlapCut }));
    ok('과거 위치를 가리키는 결과는 버리고, 확정 위치가 뒤로 가지 않음', !th.includes('옛날 위치의 글') && fin === 7, 'final=' + fin);
    ok('글이 같아도 다른 때 한 말이면 둘 다 저장 (문장이 같다고 지우지 않음)', th.filter(t => t === '가 나 다').length === 2, JSON.stringify(th));
    ok('화면 오류 없음 (겹침)', !x.errs.length, x.errs.join(' | ')); await x.c.close();

    // 90초 안내: 끊긴 지 60초가 넘으면 미리 알림
    x = await open(b); p = x.p; await wait(p, 1200); await micOn(p);
    await p.evaluate(() => __ws[0]._drop(1006)); await wait(p, 800);
    await p.evaluate(() => { rec.t0 -= 65000; }); await wait(p, 1300);
    const info = await p.evaluate(() => document.getElementById('micInfo').textContent);
    ok('끊긴 지 60초가 넘으면 "90초를 넘기면 되살리지 못한다"고 미리 알림', /90초를 넘기면/.test(info) && /끊긴 지 6\d초/.test(info), info);
    await x.c.close();
  });

  await part('idb', async () => {
    const mk = (uid, text, sec) => ({ uid, name: '대장', session: '1', rv: '1', t: new Date(Date.now() - (sec || 120) * 1000).toISOString(), text });
    // ① 두 탭이 같은 발언ID를 동시에 보냄 → 서버에 한 번, 두 탭 모두 걷음, 숫자는 "새로 저장 1 + 이미 있었음 1"
    let down = true;
    let x = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null), store: { ['t_q:' + U]: JSON.stringify([mk('same1', '두 탭이 함께 가진 말')]) } }), p = x.p; await wait(p, 1500);
    let p2 = await tab2(x.c);
    const both = await Promise.all([p.evaluate(() => queue.map(q => q.uid)), p2.evaluate(() => queue.map(q => q.uid))]);
    down = false; await Promise.all([p.evaluate(() => flush()), p2.evaluate(() => flush())]); await wait(p, 1500);
    const r1 = await Promise.all([p.evaluate(async U => ({ q: queue.length, db: (await qdb.all(U)).length, ls: localStorage.getItem('t_q:' + U), n: statLoad().n }), U), p2.evaluate(() => ({ q: queue.length }))]);
    ok('① 두 탭이 같은 발언을 동시에 보내도 서버에는 한 번만 저장', both[0].join() === 'same1' && both[1].join() === 'same1' && x.saved.same1 && Object.keys(x.saved).length === 1, JSON.stringify(both) + ' n=' + (x.saved.same1 && x.saved.same1.n));
    ok('① 두 탭 모두 대기열·localStorage·두 번째 자리에서 걷음 (사본이 남지 않음)', r1[0].q === 0 && r1[1].q === 0 && r1[0].db === 0 && !r1[0].ls, JSON.stringify(r1));
    await p2.close();
    // ⑤ 저장에 성공한 발언의 옛 사본이 다른 탭에서 되살아남 → 다시 보내도 서버가 거르고, 그 탭도 걷음
    down = true;
    p2 = await tab2(x.c);
    await p.evaluate(() => pushLine('첫 탭이 받아 적은 말')); await wait(p, 300);
    const uid = await p.evaluate(() => queue[0].uid);
    await p2.evaluate(it => { queue.push(it); }, { uid, name: '대장', session: '1', rv: '1', t: new Date().toISOString(), text: '첫 탭이 받아 적은 말' });      // 둘째 탭이 옛 사본을 메모리에 들고 있음
    down = false; await p.evaluate(() => flush()); await wait(p, 800);
    const mid = await p2.evaluate(() => ({ q: queue.length, peer: statLoad().n.peerSaved || 0 }));
    ok('⑤ 첫 탭이 저장을 확인하면 다른 탭에 알려서, 그 탭이 든 옛 사본을 바로 걷음 (다시 보내지 않음)', mid.q === 0 && mid.peer === 1 && x.saved[uid].n === 1, JSON.stringify(mid) + ' n=' + x.saved[uid].n);
    // 알림을 못 받은 경우(지원하지 않는 브라우저 흉내): 옛 사본을 다시 저장해도 서버가 거르고 걷음
    await p2.evaluate(it => { qGone.delete(it.uid); qSaved.delete(it.uid); queue.push(it); saveQueue(); }, { uid, name: '대장', session: '1', rv: '1', t: new Date().toISOString(), text: '첫 탭이 받아 적은 말' });
    await wait(p2, 300);
    const re = await p2.evaluate(async U => ({ db: (await qdb.all(U)).map(r => r.st + ':' + r.uid), ls: !!localStorage.getItem('t_q:' + U) }), U);
    await p2.evaluate(() => flush()); await wait(p2, 1000);
    const end = await p2.evaluate(async U => ({ q: queue.length, db: (await qdb.all(U)).length, ls: localStorage.getItem('t_q:' + U), dup: statLoad().n.dupOther || 0 }), U);
    ok('⑤ 옛 사본이 기기에 다시 적혀도(재현) 다시 보내면 서버가 "이미 있음"으로 거르고, 사본을 모두 걷음 (서버에는 한 번)', re.db.length === 1 && re.ls && end.q === 0 && end.db === 0 && !end.ls && x.saved[uid].n === 2 && end.dup === 1, JSON.stringify(re) + JSON.stringify(end) + ' 서버 수신 ' + x.saved[uid].n + '번(둘째는 중복으로 거름)');
    ok('화면 오류 없음 (①⑤)', !x.errs.length, x.errs.join(' | ')); await p2.close(); await x.c.close();

    // ② 한 탭이 'f'(저장 못 한 말)로 옮긴 직후, 옛 상태를 든 다른 탭이 'q'로 저장 → 'f'가 유지됨 (조건부 쓰기). 원문은 어느 쪽에도 남음
    down = true;
    x = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null) }); p = x.p; await wait(p, 1500);
    p2 = await tab2(x.c);
    const it = mk('race1', '상태가 엇갈린 말', 5);
    await p.evaluate(it => { queue.push(it); saveQueue(); }, it); await wait(p, 300);
    await p2.evaluate(it => { queue.push(it); }, it);                                  // 둘째 탭: 옛 상태(q)를 메모리에 듦, 아직 두 번째 자리에 적지 않음
    await p.evaluate(it => { queue = queue.filter(q => q.uid !== it.uid); qGone.add(it.uid); failAdd([it], '시험: 저장 못 한 말로 옮김'); saveQueue(); }, it); await wait(p, 300);
    const s1 = await p.evaluate(async U => (await qdb.all(U)).map(r => r.st + ':' + r.uid), U);
    await p2.evaluate(() => saveQueue()); await wait(p2, 400);                         // 둘째 탭이 옛 상태 q를 적으려 함
    const s2 = await p.evaluate(async U => ({ db: (await qdb.all(U)).map(r => r.st + ':' + r.uid + ':' + r.text), fail: failGet().map(f => f.uid) }), U);
    ok('② 첫 탭이 f로 옮긴 뒤 둘째 탭이 옛 상태 q를 적어도 f가 유지됨 (조건부 쓰기, 한 트랜잭션 안에서 읽고 씀)', s1.join() === 'f:race1' && s2.db.join() === 'f:race1:상태가 엇갈린 말' && s2.fail.join() === 'race1', JSON.stringify(s1) + JSON.stringify(s2));
    // 반대 순서(q가 먼저 적힌 뒤 f): f가 이김. 그리고 둘째 탭이 그 말을 실제로 보내 저장되면 양쪽 사본을 모두 걷음
    down = false; await p2.evaluate(() => flush()); await wait(p2, 1200); await p.evaluate(() => dbSync(false)); await wait(p, 500);
    const s3 = await p.evaluate(async U => ({ db: (await qdb.all(U)).length, fail: failGet().length, lsf: localStorage.getItem('t_fail:' + U) }), U);
    ok('② 그 말이 서버에 저장되면 두 번째 자리의 f 기록과 실패 목록의 사본도 걷음 (저장된 말이 "저장 못 한 말"로 남지 않음)', x.saved.race1 && x.saved.race1.n === 1 && s3.db === 0 && s3.fail === 0 && !s3.lsf, JSON.stringify(s3));
    ok('화면 오류 없음 (②)', !x.errs.length, x.errs.join(' | ')); await p2.close(); await x.c.close();

    // ③ [다시 보내기]가 두 번째 자리에 적히기 전에 창이 닫힘 → 원문이 실패 목록(f)에 그대로 남음
    down = true;
    const fl = [mk('rs1', '다시 보낼 말 하나'), mk('rs2', '다시 보낼 말 둘')].map(q => Object.assign({ why: '못 보낸 말이 5,000줄을 넘어 따로 보관' }, q));
    x = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null), store: { ['t_fail:' + U]: JSON.stringify(fl) } }); p = x.p; await wait(p, 1500);
    await p.evaluate(async (fl) => { await qdb.put(fl, cfg.url, 'f', fl[0].why); }, fl);
    // 두 번째 자리 쓰기를 끝나지 않게 막고 [다시 보내기] → 그 상태에서 새로 고침(창이 닫힌 것과 같음)
    await p.evaluate(() => { const o = qdb.put.bind(qdb); qdb.put = (items, room, st, why, force) => force ? new Promise(() => {}) : o(items, room, st, why, force); [...document.querySelectorAll('#failBox button')].find(b => /다시 보내기/.test(b.textContent)).click(); });
    await wait(p, 300);
    const t1 = await p.evaluate(U => ({ q: queue.length, lsf: JSON.parse(localStorage.getItem('t_fail:' + U) || '[]').length }), U);
    ok('③ 두 번째 자리에 적히기 전에는 실패 목록에서 빼지 않음 (대기열에도 아직 넣지 않음)', t1.q === 0 && t1.lsf === 2, JSON.stringify(t1));
    await p.reload(); await wait(p, 1800);
    const t2 = await p.evaluate(async U => ({ fail: failGet().map(f => f.text), db: (await qdb.all(U)).map(r => r.st + ':' + r.uid).sort(), box: document.getElementById('failBox').textContent.slice(0, 30) }), U);
    ok('③ 그 사이 창이 닫혀도 원문 두 줄이 "저장 못 한 말"에 그대로 남음', t2.fail.length === 2 && t2.db.join() === 'f:rs1,f:rs2' && /저장 못 한 말 2줄/.test(t2.box), JSON.stringify(t2));
    // 이번에는 정상으로 [다시 보내기] → 저장되면 목록·사본 모두 걷힘
    await p.evaluate(() => [...document.querySelectorAll('#failBox button')].find(b => /다시 보내기/.test(b.textContent)).click()); await wait(p, 500);
    const t3 = await p.evaluate(async U => ({ q: queue.map(q => q.uid).sort(), db: (await qdb.all(U)).map(r => r.st + ':' + r.uid).sort(), lsf: localStorage.getItem('t_fail:' + U) }), U);
    ok('③ 정상일 때: 두 번째 자리가 q로 바뀐 것을 확인한 뒤 목록에서 뺌', t3.q.join() === 'rs1,rs2' && t3.db.join() === 'q:rs1,q:rs2' && !t3.lsf, JSON.stringify(t3));
    down = false; await p.evaluate(() => flush()); await wait(p, 1200);
    ok('③ 서버에 한 번씩 저장되고 기기에는 아무것도 남지 않음', x.saved.rs1 && x.saved.rs2 && x.saved.rs1.n === 1 && (await p.evaluate(async U => (await qdb.all(U)).length + failGet().length + queue.length, U)) === 0);
    ok('화면 오류 없음 (③)', !x.errs.length, x.errs.join(' | ')); await x.c.close();

    // ④ localStorage가 가득 찬 상태에서 실패 목록을 대기열로 되돌림
    down = true;
    const full = () => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__full && (String(k).startsWith('t_q:') || String(k).startsWith('t_fail:'))) throw new Error('QuotaExceededError'); return o.call(this, k, v); }; };
    x = await open(b, { handle: a => (a === 'lines' && down ? 'abort' : null), initScript: full, store: { ['t_fail:' + U]: JSON.stringify(fl) } }); p = x.p; await wait(p, 1500);
    await p.evaluate(async (fl) => { await qdb.put(fl, cfg.url, 'f', fl[0].why); window.__full = true; }, fl);
    await p.evaluate(() => [...document.querySelectorAll('#failBox button')].find(b => /다시 보내기/.test(b.textContent)).click()); await wait(p, 600);
    const u1 = await p.evaluate(async U => ({ q: queue.map(q => q.uid).sort(), mem: qMemOnly(), db: (await qdb.all(U)).map(r => r.st + ':' + r.uid).sort(), lsq: localStorage.getItem('t_q:' + U), pill: document.getElementById('sendPill').textContent }), U);
    ok('④ localStorage가 가득 차도 두 번째 자리에 q로 적혀 대기열로 돌아옴 ("메모리에만"이 아님)', u1.q.join() === 'rs1,rs2' && u1.mem === 0 && u1.db.join() === 'q:rs1,q:rs2' && !u1.lsq && !/메모리에만/.test(u1.pill), JSON.stringify(u1));
    await p.reload(); await wait(p, 1800);
    ok('④ 그 상태로 창을 닫았다 열어도 두 줄이 대기열에 남아 있음', (await p.evaluate(() => queue.map(q => q.uid).sort().join())) === 'rs1,rs2');
    // 두 곳 모두 못 쓰면: 목록에서 빼지 않고(사본 유지) 메모리의 대기열로만 보냄
    await p.evaluate(async (fl) => { queue = []; window.__full = false; localStorage.setItem('t_fail:' + cfg.url, JSON.stringify(fl)); await qdb.del(fl.map(f => f.uid)); window.__full = true; qdb.put = async () => false; failDb = []; sendState(); }, fl); await wait(p, 200);
    await p.evaluate(() => [...document.querySelectorAll('#failBox button')].find(b => /다시 보내기/.test(b.textContent)).click()); await wait(p, 500);
    const u2 = await p.evaluate(U => ({ q: queue.length, mem: qMemOnly(), lsf: JSON.parse(localStorage.getItem('t_fail:' + U) || '[]').length }), U);
    ok('④ 두 곳 모두 적지 못하면 실패 목록의 사본을 지우지 않음 (원문이 기기에 한 벌은 남음)', u2.q === 2 && u2.mem === 2 && u2.lsf === 2, JSON.stringify(u2));
    down = false; await p.evaluate(() => flush()); await wait(p, 1200);
    const u3 = await p.evaluate(U => ({ q: queue.length, f: failGet().length, lsf: localStorage.getItem('t_fail:' + U) }), U);
    ok('④ 서버 저장이 확인되면 그 사본도 걷음', x.saved.rs1 && x.saved.rs2 && u3.q === 0 && u3.f === 0 && !u3.lsf, JSON.stringify(u3));
    ok('화면 오류 없음 (④)', !x.errs.length, x.errs.join(' | ')); await x.c.close();
  });

  await part('next', async () => {
    // 서버 답을 바꿔 가며: 받아 둔 추천을 다시 쓴다는 이유로 최신이라고 하지 않는지, 회차를 알 수 없는 추천을 어떻게 보여 주는지
    const nx = (o) => Object.assign({ key: '1.1.1.1', sess: '1', rv: '1', at: '2026-11-21 13:01:00', t: Date.now(), now: { scene: '서재', just: '책장을 봄', agreed: '', held: '' }, items: [{ kind: '행동', title: '책장을 더 살핀다', why: '', prio: 1, src: [], guess: false }],
      basis: { processedId: 0, total: 6, rawFrom: 1, rawTo: 6, rawN: 6, rawCut: 0, rawSkip: 0, lastTime: '2026-11-21 13:01:00', sums: 0, sumVer: '1', notesVer: '1' } }, o);
    let ans = { ok: true, next: nx(), fresh: false, reusable: true, reused: true, behind: 1 };
    let x = await open(b, { handle: a => (a === 'nextSteps' ? ans : a === 'data' ? Object.assign(baseData(), { v: Object.assign({}, V, { total: 7 }) }) : null) }), p = x.p; await wait(p, 1500);
    const openNext = async () => { await p.evaluate(() => { const t = [...document.querySelectorAll('[data-tab]')].find(e => e.dataset.tab === 'next'); if (t) t.click(); return nextOpen(false); }); await wait(p, 400); return p.evaluate(() => ({ st: document.getElementById('nextSt').textContent, fr: document.getElementById('nextFresh').textContent })); };
    let v = await openNext();
    ok('새 서버: 받아 둔 추천(fresh:false, reused)이면 "받아 둔 추천, 그 뒤 새 기록 1줄은 반영되지 않음"이라고 적음', /받아 둔 추천이에요/.test(v.st) && /새 기록 1줄/.test(v.st) && /그 뒤 새 기록 1줄/.test(v.fr), v.st + ' | ' + v.fr);
    ans = { ok: true, next: nx(), fresh: true, behind: 1 };                 // 예전 서버(.25)의 답: 다시 쓴 추천을 fresh:true로
    v = await openNext();
    ok('예전 서버(.25)가 fresh:true, behind:1로 답해도 최신이라고 하지 않음 (화면이 새 기록 수로 직접 판단)', /받아 둔 추천이에요/.test(v.st) && !/새 기록 없음/.test(v.fr) && /그 뒤 새 기록 1줄/.test(v.fr), v.st + ' | ' + v.fr);
    ans = { ok: true, next: nx({ basis: Object.assign(nx().basis, { total: 7, rawTo: 7 }) }), fresh: true, reusable: true, reused: true, behind: 0 };
    v = await openNext();
    ok('새 기록이 없으면 "그 뒤 새 기록 없음" (받아 둔 추천이어도 최신 맞음)', /그 뒤 새 기록 없음/.test(v.fr) && !/받아 둔 추천이에요/.test(v.st), v.st + ' | ' + v.fr);
    // 회차·초기화 번호를 알 수 없는 추천 (sess·rv·key 모두 없음)
    const anon = nx({ basis: Object.assign(nx().basis, { total: 7 }) }); delete anon.sess; delete anon.rv; delete anon.key;
    ans = { ok: true, next: anon, fresh: true, behind: 0 };
    v = await openNext();
    ok('어느 회차의 추천인지 서버가 알려 주지 않으면: 보여 주되 "확인하지 못했어요"라고 적고 "새 기록 없음"이라고 하지 않음', /어느 회차의 추천인지 확인하지 못했어요/.test(v.fr) && !/새 기록 없음/.test(v.fr) && (await p.evaluate(() => !!nextSt.data)), v.fr);
    ans = { ok: true, next: nx({ sess: '9', key: '1.1.9.1' }), fresh: true, behind: 0 };
    v = await openNext();
    ok('다른 회차의 추천은 여전히 보이지 않음 (4차 수정 유지)', /지난 세션의 추천/.test(v.st) && (await p.evaluate(() => nextSt.data === null)), v.st);
    ok('화면 오류 없음 (추천)', !x.errs.length, x.errs.join(' | ')); await x.c.close();
  });

  await part('stat', async () => {
    // 세션 측정: 보존 판단에 "이미 있었음(dup)"을 넣고, 이 창이 받아 적은 말과 이어받아 보낸 말을 나눠 셈
    let lose = 1;           // 첫 요청은 서버가 저장했지만 응답이 오지 않은 것으로 (화면은 실패로 알고 다시 보낸다)
    const x = await open(b, { store: { ['t_q:' + U]: JSON.stringify([{ uid: 'adopt1', name: '대장', session: '1', rv: '1', t: new Date(Date.now() - 200000).toISOString(), text: '닫힌 창이 남긴 말' }]) },
      handle: (a, j, url, ctx) => { if (a !== 'lines') return null; if (lose > 0 && (j.items || []).some(it => /하나/.test(it.text))) { lose--; (j.items || []).forEach(it => { ctx.saved[it.uid] = { n: 1, text: it.text, url }; }); return 'abort'; } return null; } });
    const p = x.p; await wait(p, 600);
    await p.evaluate(() => { pushLine('이 창이 받아 적은 말 하나'); pushLine('이 창이 받아 적은 말 둘'); flush(); }); await wait(p, 5500);
    await p.evaluate(() => { pushLine('이 창이 받아 적은 말 셋'); flush(); }); await wait(p, 1200);
    const n = await N(p), txt = await p.evaluate(() => statText());
    ok('저장은 됐는데 응답을 못 받아 다시 보낸 말은 "이미 있었음"으로 세고 보존 확인에 넣음', n.queued === 3 && n.savedMine === 1 && n.dupMine === 2 && /받아 적은 3줄 가운데 서버 보존 확인 3줄 \(새로 저장 1 \+ 서버에 이미 있었음 2/.test(txt), JSON.stringify({ queued: n.queued, savedMine: n.savedMine, dupMine: n.dupMine, savedOther: n.savedOther, dupOther: n.dupOther }));
    ok('닫힌 창이 남긴 말은 "이어받아 보낸 말"로 따로 세어, 이 창이 받아 적은 줄 수를 넘기지 않음', (n.savedOther || 0) + (n.dupOther || 0) === 1 && /이어받아 보낸 말/.test(txt), txt.split('\n')[2].slice(0, 200));
    ok('서버에는 네 줄이 한 번씩만 있음', Object.keys(x.saved).length === 4);
    // 표본과 전체를 구분해 적음
    await p.evaluate(() => { const o = statLoad(); for (let i = 0; i < 3500; i++) statLat(1000 + (i % 7) * 100); for (let i = 0; i < 400; i++) statMs('nextInstant', 50 + i % 5); });
    const t2 = await p.evaluate(() => statText());
    ok('저장 시간: 표본(최근 3,000줄)과 전체 줄 수·평균·최대를 구분해 적음', /전체 35\d\d줄 중 최근 3000줄 표본/.test(t2) && /전체 평균/.test(t2) && /전체 최대/.test(t2), t2.split('\n').find(l => /저장까지/.test(l)));
    ok('화면이 뜬 시간: 전체 400번 중 최근 300번 표본이라고 적고, 이해 시간은 재지 못한다고 적음', /전체 400번 중 최근 300번 표본/.test(t2) && /읽고 이해하는 데 걸린 시간은 기계가 재지 못해요/.test(t2));
    ok('Deepgram 확인은 "그 위치까지 처리했다"는 뜻이지 글이 맞다는 뜻이 아니라고 적음', /글로 맞게 적혔는지는 재지 못해요/.test(t2));
    ok('화면 오류 없음 (측정)', !x.errs.length, x.errs.join(' | ')); await x.c.close();
  });

  await b.close(); done();
})();
