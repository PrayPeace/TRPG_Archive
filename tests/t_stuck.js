// 3. 구버전(11-21.17)에서 두 세션이 한 구간에 묶여 앞 세션만 저장되고 막힌 방 → 새 판으로 열어 복구
const { makeStore, makeBook, exec, room, run, post, ok, done, oldCode, CODE } = require('./lib.js');
const OLD = oldCode('3c3a04a'), CUR = oldCode('3d40200');     // 11-21.17(두 세션을 한 구간에 묶던 판), 11-21.21(고치기 전)
function scenario(label, newCode) {
  const st = makeStore(); const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  makeBook(st, A, '🎲TRPG Archive · CoC 질긴 결속 사본');
  run(exec(st, A, { code: OLD }), "setup('pwA')");
  run(exec(st, A, { code: OLD }), "setConf('keeperName','키퍼')");
  const names = ['키퍼', '철수', '영희', '민수', '지현'], items = [], base = Date.parse('2026-11-21T10:00:00Z');
  for (let i = 0; i < 222; i++) items.push({ uid: 'L' + i, name: names[i % 5], session: i < 100 ? '1' : '2', t: new Date(base + i * 7000).toISOString(), text: '발언' + (i + 1) + ' 지하실 문을 연다 ' + 'ㄴ'.repeat(i % 20) });
  for (let i = 0; i < 222; i += 100) post(exec(st, A, { code: OLD }), { action: 'lines', pw: 'pwA', items: items.slice(i, i + 100) });
  // 세션 2 대화가 10줄 넘게 들어가면 AI 답이 잘린다고 가정 (반으로 줄여야 풀림)
  st.aiFail = (sys, text) => { const n = (text.match(/발언(\d+)/g) || []).map(x => Number(x.slice(2))).filter(x => x > 100).length; return n > 10 ? 'AI 답이 잘렸어요 (가짜)' : ''; };
  for (let k = 0; k < 6; k++) { try { run(exec(st, A, { code: OLD }), 'processNow(true)'); } catch (e) {} }
  const c0 = exec(st, A, { code: OLD });
  const p0 = run(c0, "confJson('pending', null)");
  const oldState = 'pending ' + JSON.stringify({ from: p0 && p0.from, to: p0 && p0.to, fails: p0 && p0.fails }) + ', 처리 ' + run(c0, "getConf('processedId')") + ', 요약 ' + (run(c0, 'sheet(SH.SUM).getLastRow()') - 1) + '개';
  // 새 판으로 연다 (초기화 없음). 5분마다 tick이 도는 것처럼 여러 번
  const t0 = Date.now(); let rounds = 0;
  for (; rounds < 30; rounds++) {
    try { run(exec(st, A, { code: newCode }), 'processNow(false)'); } catch (e) {}
    const c = exec(st, A, { code: newCode });
    if (Number(run(c, "getConf('processedId')")) === 222 && !run(c, 'notesQ().length')) break;
  }
  const c = exec(st, A, { code: newCode });
  const lines = run(c, 'allLineRows()');
  const sums = run(c, `sheet(SH.SUM).getRange(2,1,Math.max(1,sheet(SH.SUM).getLastRow()-1),6).getValues()`);
  const cited = new Set(); sums.forEach(r => (String(r[3]).match(/#(\d+)/g) || []).forEach(x => cited.add(Number(x.slice(1)))));
  const miss = []; for (let i = 1; i <= 222; i++) if (!cited.has(i)) miss.push(i);
  const keys = sums.map(r => r[5]); const dupKeys = keys.length - new Set(keys).size;
  const bySess = {}; sums.forEach(r => { bySess[r[0]] = (bySess[r[0]] || 0) + 1; });
  return { st, c, label, oldState, rounds, ms: Date.now() - t0, lines: lines.length, processed: Number(run(c, "getConf('processedId')")), miss, dupKeys, bySess, clues: (run(c, 'readNotes()').clues || []).length, fail: run(c, 'notesFail().length'), q: run(c, 'notesQ().length') };
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
