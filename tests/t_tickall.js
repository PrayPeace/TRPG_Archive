// 5. 엔진 tickAll: A 방 AI가 실제로 느릴 때 B 방 발언 저장 시간과 B 방 요약 시작 대기 시간 (가상 시계)
const { makeStore, exec, room, run, post, ok, done, oldCode, CODE } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', B = '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', C = '1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const ENG = 'https://script.google.com/macros/s/ENGINEabc/exec';
const L = (p, n, s) => Array.from({ length: n }, (_, i) => ({ uid: p + i, name: ['키퍼', '철수', '영희'][i % 3], session: s || '1', t: new Date(Date.parse('2026-11-21T10:00:00Z') + i * 4000).toISOString(), text: p + ' 발언 ' + i + ' ' + 'ㄷ'.repeat(200) }));
function setupStore(code) {
  const st = makeStore(); st.vclock = { t: Date.parse('2026-11-21T12:00:00Z') };
  [[A, 'pwA', 600], [B, 'pwB', 60], [C, 'pwC', 60]].forEach(([id, pw, n]) => { room(st, id, pw); post(exec(st, id, { code }), { action: 'lines', pw, items: L(id.slice(1, 2), n) }); run(exec(st, id, { code }), 'hostRoom()'); });
  post(exec(st, null, { serviceUrl: ENG, code }), { action: 'ping', pw: 'x' });
  return st;
}
function measure(code, label) {
  const st = setupStore(code);
  st.aiDelay = (room) => room === A ? 150000 : 8000;            // A 방 AI는 한 번에 150초 (느림), B·C는 8초
  const starts = {}; let bSave = null;
  st.onAi = (room) => {
    if (!starts[room]) starts[room] = st.vclock.t;
    if (room === A && !bSave) {                                // A의 AI가 도는 동안 B에서 말한다
      const t0 = st.vclock.t;
      const r = post(exec(st, null, { serviceUrl: ENG, code }), { action: 'lines', pw: 'pwB', items: L('Bnew', 5, '1') }, { room: B });
      bSave = { ok: r.ok && r.saved.length === 5, ms: st.vclock.t - t0, err: r.error };
    }
  };
  const t0 = st.vclock.t;
  let crashed = false;
  try { run(exec(st, null, { serviceUrl: ENG, code }), 'tickAll()'); } catch (e) { crashed = e.message; }
  const total = st.vclock.t - t0;
  const pB = Number(run(exec(st, B, { code }), "getConf('processedId')"));
  return { label, bSave, bWait: starts[B] ? starts[B] - t0 : null, cWait: starts[C] ? starts[C] - t0 : null, total, pB, next: st.props.tickAllAt, st, crashed };
}
const before = measure(oldCode('0ae47a2'), '11-21.22');
const now = measure(CODE, '새 판');
for (const m of [before, now]) console.log(`[${m.label}] B 저장 ${m.bSave && m.bSave.ok ? '성공' : '실패'} ${m.bSave ? m.bSave.ms : '-'}ms(가상) · B 요약 시작까지 ${m.bWait == null ? '못 함' : (m.bWait / 1000) + '초'} · C ${m.cWait == null ? '못 함' : (m.cWait / 1000) + '초'} · 한 번 실행 ${(m.total / 1000)}초 (한도 360초) · 다음 시작 방 ${m.next}`);
ok('A의 AI가 도는 동안 B 발언은 기다림 없이 저장', now.bSave && now.bSave.ok && now.bSave.ms === 0);
ok('한 번 실행이 6분 한도 안', now.total <= 360000, now.total / 1000 + '초');
ok('B·C 요약이 같은 실행 안에서 시작 (A의 AI 한 번만 기다림)', now.bWait != null && now.bWait <= 160000 && now.cWait != null, 'B ' + now.bWait / 1000 + '초, C ' + now.cWait / 1000 + '초');
ok('고치기 전 판은 B가 A를 오래 기다림(비교)', before.bWait == null || before.bWait > now.bWait, String(before.bWait));
// 강제 종료: 실행이 A 방 처리 중에 죽음 → 다음 실행은 A 다음 방부터
{
  const st = setupStore(CODE); st.aiDelay = (room) => room === A ? 150000 : 8000;
  st.props.tickAllAt = '0';
  const c = exec(st, null, { serviceUrl: ENG });
  // A 방을 처리하는 도중 실행 전체가 끊긴 것처럼: 그 자리에서 tickAll 바깥까지 빠져나간다 (뒤처리 코드가 돌지 않음)
  run(c, `var __tick = tick; tick = function(ms){ if (ssId() === '${A}') throw new Error('KILL'); return __tick(ms); }; Logger.log = function(m){ if (/KILL/.test(String(m))) throw new Error('강제 종료'); };`);
  let killed = false; try { run(c, 'tickAll()'); } catch (e) { killed = true; }
  ok('강제 종료돼도 다음 차례는 A 다음 방', killed && st.props.tickAllAt === '1', 'tickAllAt=' + st.props.tickAllAt + (killed ? ' (도중에 끊김)' : ' (끊기지 않음)'));
}
// 여러 번 돌면 모두 따라잡음, 시작 방이 돌아감
{
  const st = setupStore(CODE); st.aiDelay = (room) => room === A ? 150000 : 8000;
  const firsts = [];
  for (let k = 0; k < 12; k++) { const c = exec(st, null, { serviceUrl: ENG }); const log = run(c, 'tickAll()'); firsts.push(log && log[0] ? log[0].id.slice(1, 2) : '-'); st.vclock.t += 300000; }
  const p = id => Number(run(exec(st, id), "getConf('processedId')")) + '/' + run(exec(st, id), 'totalLines()');
  ok('12번(1시간) 돌면 세 방 모두 따라잡음', [A, B, C].every(id => { const [a, b] = p(id).split('/'); return a === b; }), 'A ' + p(A) + ' B ' + p(B) + ' C ' + p(C));
  ok('시작 방이 돌아감', new Set(firsts).size === 3, firsts.join(''));
}
done();
