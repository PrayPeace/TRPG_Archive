// 3. 구버전(11-21.17)에서 두 세션이 한 구간에 묶여 앞 세션만 저장되고 막힌 방 → 새 판으로 열어 복구
const { makeStore, makeBook, exec, room, run, post, ok, done, oldCode, CODE } = require('./lib.js');
const OLD = oldCode('3c3a04a'), CUR = oldCode('3d40200');     // 11-21.17(두 세션을 한 구간에 묶던 판), 11-21.21(고치기 전)
function scenario(label, newCode, sessOf, opts) {
  opts = opts || {};
  sessOf = sessOf || (i => i < 100 ? '1' : '2');
  const st = makeStore(); const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  makeBook(st, A, '🎲TRPG Archive · CoC 질긴 결속 사본');
  run(exec(st, A, { code: OLD }), "setup('pwA')");
  run(exec(st, A, { code: OLD }), "setConf('keeperName','키퍼')");
  const names = ['키퍼', '철수', '영희', '민수', '지현'], items = [], base = Date.parse('2026-11-21T10:00:00Z');
  for (let i = 0; i < 222; i++) items.push({ uid: 'L' + i, name: names[i % 5], session: sessOf(i), t: new Date(base + i * 7000).toISOString(), text: '발언' + (i + 1) + ' 지하실 문을 연다 ' + 'ㄴ'.repeat(i % 20) });
  for (let i = 0; i < 222; i += 100) post(exec(st, A, { code: OLD }), { action: 'lines', pw: 'pwA', items: items.slice(i, i + 100) });
  // 세션 2 대화가 10줄 넘게 들어가면 AI 답이 잘린다고 가정 (반으로 줄여야 풀림)
  st.killLeft = opts.kill || 0;
  st.aiFail = (sys, text) => { const n = (text.match(/발언(\d+)/g) || []).map(x => Number(x.slice(2))).filter(x => sessOf(x - 1) === '2').length; return n > 10 ? 'AI 답이 잘렸어요 (가짜)' : ''; };
  for (let k = 0; k < 6; k++) { try { run(exec(st, A, { code: OLD }), 'processNow(true)'); } catch (e) {} }
  const c0 = exec(st, A, { code: OLD });
  const p0 = run(c0, "confJson('pending', null)");
  const oldState = 'pending ' + JSON.stringify({ from: p0 && p0.from, to: p0 && p0.to, fails: p0 && p0.fails }) + ', 처리 ' + run(c0, "getConf('processedId')") + ', 요약 ' + (run(c0, 'sheet(SH.SUM).getLastRow()') - 1) + '개';
  // 새 판으로 연다 (초기화 없음). 5분마다 tick이 도는 것처럼 여러 번
  const t0 = Date.now(); let rounds = 0;
  for (; rounds < 30; rounds++) {
    const code = opts.codes ? opts.codes(rounds) : newCode;
    try {
      const cx = exec(st, A, { code });
      // 강제 종료 흉내: "이미 요약한 번호(sumDone)"는 썼는데 구간(pending)을 고쳐 쓰기 직전에 실행이 끊김
      if (opts.kill) run(cx, "var _sj = setJson; setJson = function(k, o){ if (k === 'pending' && o && __store.killLeft > 0 && getConf('sumDone')) { __store.killLeft--; __store.killed = (__store.killed || 0) + 1; throw new Error('강제 종료(가짜)'); } return _sj(k, o); };");
      run(cx, 'processNow(false)');
    } catch (e) {}
    const c = exec(st, A, { code: newCode });
    if (Number(run(c, "getConf('processedId')")) === 222 && !run(c, 'notesQ().length')) break;
  }
  const c = exec(st, A, { code: newCode });
  const lines = run(c, 'allLineRows()');
  const sums = run(c, `sheet(SH.SUM).getRange(2,1,Math.max(1,sheet(SH.SUM).getLastRow()-1),6).getValues()`);
  const cited = new Set(), times = {}, wrongSess = [];
  sums.forEach(r => (String(r[3]).match(/#(\d+)/g) || []).forEach(x => { const id = Number(x.slice(1)); cited.add(id); times[id] = (times[id] || 0) + 1; if (sessOf(id - 1) !== String(r[0])) wrongSess.push(id); }));
  const twice = Object.keys(times).filter(k => times[k] > 1).map(Number);
  const miss = []; for (let i = 1; i <= 222; i++) if (!cited.has(i)) miss.push(i);
  const keys = sums.map(r => r[5]); const dupKeys = keys.length - new Set(keys).size;
  const bySess = {}; sums.forEach(r => { bySess[r[0]] = (bySess[r[0]] || 0) + 1; });
  return { twice, wrongSess, st, c, label, oldState, rounds, ms: Date.now() - t0, lines: lines.length, processed: Number(run(c, "getConf('processedId')")), miss, dupKeys, bySess, clues: (run(c, 'readNotes()').clues || []).length, fail: run(c, 'notesFail().length'), q: run(c, 'notesQ().length') };
}
const before = scenario('11-21.21(고치기 전)', CUR);
console.log('구버전에서 만든 막힌 상태:', before.oldState);
console.log('[고치기 전 판으로 열기] 처리 번호', before.processed, '/ 222, 빠진 줄', before.miss.length);
ok('고치기 전 판에서는 막힘이 재현됨', before.processed < 222);
const r = scenario('새 판', CODE);
console.log('[새 판] tick', r.rounds + 1, '번,', r.ms, 'ms, 원문', r.lines, '줄, 처리', r.processed, ', 세션별 요약', JSON.stringify(r.bySess), ', 단서', r.clues, '개');
ok('초기화 없이 끝까지 처리', r.processed === 222);
ok('원문 222줄 그대로', r.lines === 222);
ok('요약이 222줄을 빠짐없이 다룸', !r.miss.length, '빠짐 ' + r.miss.length + ' ' + r.miss.slice(0, 12).join(','));
ok('같은 구간 요약 중복 없음', r.dupKeys === 0, '중복 ' + r.dupKeys);
ok('세션 1·2 요약 모두', r.bySess['1'] > 0 && r.bySess['2'] > 0);
ok('단서 정리 이어짐, 대기·실패 0', r.clues > 0 && r.q === 0 && r.fail === 0, '단서 ' + r.clues + ' 대기 ' + r.q + ' 실패 ' + r.fail);

// 세션이 1→2→1→2로 섞인 방 (1~40·81~100번이 세션 1): 구버전이 앞 구간(1~120)의 세션 1 요약만 보관한 채 막힘
const mix = i => (i < 40 || (i >= 80 && i < 100)) ? '1' : '2';
const prev = scenario('11-21.22', oldCode('0ae47a2'), mix);
console.log('[섞인 세션 · 고치기 전(.22)] 처리', prev.processed, ', 두 번 요약된 줄', prev.twice.length, prev.twice.slice(0, 5).join(','));
ok('고치기 전 판에서는 81~100번이 두 요약에 들어감(재현)', prev.twice.length > 0);
const m = scenario('새 판', CODE, mix);
console.log('[섞인 세션 · 새 판] 처리', m.processed, ', 세션별 요약', JSON.stringify(m.bySess), ', 두 번 요약', m.twice.length, ', 세션이 틀린 줄', m.wrongSess.length, ', 빠짐', m.miss.length);
ok('섞인 세션도 끝까지 처리', m.processed === 222);
ok('발언마다 요약에 정확히 한 번', !m.twice.length && !m.miss.length, '두 번 ' + m.twice.length + ' 빠짐 ' + m.miss.length);
ok('발언은 자기 세션 요약에만', !m.wrongSess.length);
ok('섞인 세션: 대기·실패 0, 처리 뒤 기억해 둔 번호 비움', m.q === 0 && m.fail === 0 && !run(m.c, "getConf('sumDone')"));
ok('세션 1 요약도 1~40·81~100을 모두 다룸', [1, 40, 81, 100].every(id => !m.miss.includes(id)));

// 강제 종료: sumDone을 쓴 직후 pending을 고쳐 쓰기 전에 두 번 끊겨도 정확히 한 번
const k = scenario('새 판 + 강제 종료', CODE, mix, { kill: 2 });
console.log('[섞인 세션 · 강제 종료 ' + (k.st.killed || 0) + '번] 처리', k.processed, ', 두 번 요약', k.twice.length, ', 빠짐', k.miss.length);
ok('sumDone과 구간 기록 사이에서 끊겨도 발언마다 정확히 한 번', (k.st.killed || 0) >= 1 && k.processed === 222 && !k.twice.length && !k.miss.length && !k.wrongSess.length, '끊김 ' + (k.st.killed || 0) + '번');
// 새 판 → 11-21.23으로 되돌림 → 다시 새 판 (복구 도중에 판이 오가도)
const P23 = oldCode('342716d');
const rb = scenario('새 판↔.23', CODE, mix, { codes: n => (n === 1 || n === 2 ? P23 : CODE) });
console.log('[섞인 세션 · 새 판→.23→새 판] 처리', rb.processed, ', 두 번 요약', rb.twice.length, ', 빠짐', rb.miss.length);
ok('복구 도중 .23으로 되돌렸다 다시 올려도 정확히 한 번', rb.processed === 222 && !rb.twice.length && !rb.miss.length && !rb.wrongSess.length);
// 이미 요약한 번호가 3,000개를 넘어도 버리지 않는다 (예전에는 오래된 번호가 조용히 잘렸다)
{
  const st2 = makeStore(), B = '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; room(st2, B, 'pwB');
  const ids = []; for (let i = 1; i <= 7000; i += 2) ids.push(i); for (let i = 20000; i < 22000; i++) ids.push(i);      // 흩어진 3,500개 + 이어진 2,000개
  run(exec(st2, B), 'withLock(20000, () => sumDoneAdd(' + JSON.stringify(ids) + '))');
  const c5 = exec(st2, B), got = run(c5, 'Array.from(sumDoneSet())');
  ok('이미 요약한 번호 5,500개를 하나도 버리지 않음', got.length === ids.length && ids.every((x, i) => got.includes(x) || i < 0), got.length + '개, 저장 글자 수 ' + String(run(c5, "getConf('sumDone')")).length);
  run(exec(st2, B), 'withLock(20000, () => sumDonePrune(6998))');
  ok('처리 번호 뒤의 것만 남김', run(exec(st2, B), 'Array.from(sumDoneSet())').length === 2001);
  run(exec(st2, B), "withLock(20000, () => { setJson('sumDone', null); sumDoneAdd([5, 6, 7]); })");
  ok('3,000개 이하면 예전 판도 읽는 번호 배열 그대로', run(exec(st2, B), "getConf('sumDone')") === '[5,6,7]');
}

// 한 발언만 남았는데 AI가 계속 실패: 마스터가 원문을 보고 '원문만 남기고 넘어가기'
{
  const { st, c } = r; const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  st.aiFail = (sys, text) => /저주받은 문장/.test(text) ? 'AI가 계속 실패 (가짜)' : '';
  post(exec(st, A), { action: 'lines', pw: 'pwA', items: [{ uid: 'X1', name: '철수', session: '2', t: new Date().toISOString(), text: '저주받은 문장 ' + 'ㅎ'.repeat(30) }, { uid: 'X2', name: '영희', session: '2', t: new Date().toISOString(), text: '평범한 다음 말' }] });
  for (let k = 0; k < 8; k++) { try { run(exec(st, A), 'processNow(false)'); } catch (e) {} }
  const c2 = exec(st, A), stk = run(c2, 'stuckInfo()');
  ok('막힌 줄을 마스터에게 보여 줌', stk && stk.lines.length === 1 && /저주받은/.test(stk.lines[0].text), JSON.stringify(stk && { from: stk.from, to: stk.to, fails: stk.fails }));
  const d = run(exec(st, A), 'allData()'); ok('allData에 stuck 실림', !!d.stuck);
  const sk = run(exec(st, A), 'pendingSkip(' + stk.from + ')'); ok('원문만 남기고 넘어가기', sk.ok, sk.message || sk.error);
  for (let k = 0; k < 6; k++) { try { run(exec(st, A), 'processNow(false)'); } catch (e) {} }
  const c3 = exec(st, A);
  ok('다음 말까지 처리', Number(run(c3, "getConf('processedId')")) === 224);
  ok('원문 224줄 그대로', run(c3, 'allLineRows()').length === 224);
  const all = run(c3, 'notesQ().length') + run(c3, 'notesFail().length');
  ok('그 줄의 단서 정리 작업은 실패 목록에 보관(버리지 않음)', run(c3, 'notesFail().length') >= 1, '대기+실패 ' + all);
}
done();
