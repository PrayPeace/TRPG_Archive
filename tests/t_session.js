// 90점 기준: 다섯 명이 말하는 중 AI 요약이 계속 실패해도 발언은 저장되고, 쉬는 시간에 '지금 요약'·'다시 정리'로 누락 없이 따라잡는다
const { makeStore, exec, room, run, post, ok, done } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const st = makeStore(); room(st, A, 'pwA'); run(exec(st, A), "setConf('keeperName','키퍼')");
const names = ['키퍼', '철수', '영희', '민수', '지현']; let n = 0, sent = 0, saved = 0, dupSeen = 0;
st.aiFail = () => 'Claude 서버 과부하 (가짜)';                       // 세션 내내 AI 실패
const t0 = Date.now(); const base = Date.parse('2026-11-21T19:00:00Z');
for (let minute = 0; minute < 60; minute++) {
  const items = names.map((nm, i) => ({ uid: 'S' + (n + i), name: nm, session: '1', t: new Date(base + (n + i) * 2400).toISOString(), text: nm + ' 발언' + (n + i + 1) + ' 촛불이 흔들린다' }));
  n += items.length; sent += items.length;
  const r = post(exec(st, A), { action: 'lines', pw: 'pwA', items });
  saved += r.saved.length;
  if (minute % 7 === 3) { const r2 = post(exec(st, A), { action: 'lines', pw: 'pwA', items }); dupSeen += r2.dup.length; }   // 응답 끊김 → 재전송
  if (minute % 5 === 0) { try { run(exec(st, A), 'tick()'); } catch (e) {} }   // 5분 트리거 (AI 실패)
}
const c1 = exec(st, A);
console.log('입력', sent, '줄 / 저장', saved, '줄 / 재전송 중 걸러진 중복', dupSeen, '/ 세션 중 처리 번호', run(c1, "getConf('processedId')"));
ok('AI가 계속 실패해도 발언은 모두 저장', saved === sent && run(c1, 'totalLines()') === sent);
// 쉬는 시간: AI 회복 → 마스터가 '지금 요약' / 막힌 구간이면 '다시 시도' / 정리 실패는 '다시 정리'
st.aiFail = null;
let presses = 0;
for (; presses < 10; presses++) {
  const c = exec(st, A);
  const stk = run(c, 'stuckInfo()'); if (stk) run(exec(st, A), 'pendingRetry()'); else run(exec(st, A), 'processNow(true)');
  if (run(exec(st, A), 'notesFail().length')) run(exec(st, A), 'notesRetry()');
  const cc = exec(st, A); if (Number(run(cc, "getConf('processedId')")) === sent && !run(cc, 'notesQ().length') && !run(cc, 'notesFail().length')) break;
}
const c = exec(st, A);
const sums = run(c, `sheet(SH.SUM).getRange(2,1,Math.max(1,sheet(SH.SUM).getLastRow()-1),6).getValues()`);
const cited = new Set(); sums.forEach(r => (String(r[3]).match(/#(\d+)/g) || []).forEach(x => cited.add(Number(x.slice(1)))));
const miss = []; for (let i = 1; i <= sent; i++) if (!cited.has(i)) miss.push(i);
console.log('쉬는 시간 누른 횟수', presses + 1, '/ 요약', sums.length, '개 / 빠진 줄', miss.length, '/ 걸린 시간(가짜 환경)', Date.now() - t0, 'ms');
ok('쉬는 시간에 누락 없이 따라잡음', !miss.length && Number(run(c, "getConf('processedId')")) === sent);
ok('정리 대기·실패 0', !run(c, 'notesQ().length') && !run(c, 'notesFail().length'));
done();
