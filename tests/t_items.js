const { makeStore, exec, room, run, post, ok, done } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
console.log('── 1. 정리 재시도: 대기 150 + 실패 1');
{
  const st = makeStore(); room(st, A, 'pwA');
  run(exec(st, A), `withLock(1000,()=>{ const q=[]; for(let i=0;i<150;i++) q.push({k:'k'+i,s:'1',f:i,t:i+1}); notesQSet(q); notesFailAdd([{k:'kf',s:'1',f:500,t:501}],'시험'); })`);
  const ids = c => { const q = run(c, 'notesQ()').map(x => x.k), f = run(c, 'notesFail()').map(x => x.k); return { q, f, all: [...q, ...f].sort().join(',') }; };
  const before = ids(exec(st, A));
  let res = [];
  for (let i = 0; i < 3; i++) res.push(run(exec(st, A), 'notesRetry()'));
  const after = ids(exec(st, A));
  ok('첫 작업 k0이 남아 있음', after.q[0] === 'k0');
  ok('세 번 눌러도 전체 작업 ID 집합 같음 (151개)', before.all === after.all && after.q.length + after.f.length === 151, '대기 ' + after.q.length + ' 실패 ' + after.f.length);
  ok('결과에 옮긴 건수·남은 건수', res.every(r => r.moved === 0 && r.left === 1), JSON.stringify(res[0]));
  run(exec(st, A), `withLock(1000,()=>{ const q=notesQ(); q.splice(0,1); notesQSet(q); })`);
  const r2 = run(exec(st, A), 'notesRetry()'); const a2 = ids(exec(st, A));
  ok('빈자리가 생기면 그만큼만 옮김', r2.moved === 1 && r2.left === 0 && a2.q.length === 150 && a2.f.length === 0, JSON.stringify(r2));
}
console.log('── 2. 긴 발언 원문 보존');
{
  const st = makeStore(); room(st, A, 'pwA');
  const mk = n => Array.from({ length: n }, (_, i) => String.fromCharCode(0xAC00 + (i % 11172))).join('');
  const cases = [['40001자', mk(40001)], ['=로 시작 90000자', '=' + mk(89999)], ['12만 자', mk(120000)], ['짧은 말', '안녕']];
  const items = cases.map(([n, t], i) => ({ uid: 'B' + i, name: '철수', text: t, t: new Date().toISOString() }));
  const r1 = post(exec(st, A), { action: 'lines', pw: 'pwA', items });
  ok('저장 성공 4건', r1.ok && r1.saved.length === 4, JSON.stringify({ saved: r1.saved.length, added: r1.added }));
  const r2 = post(exec(st, A), { action: 'lines', pw: 'pwA', items });   // 응답이 끊겨 다시 보낸 경우
  ok('다시 보내도 중복 없음', r2.dup.length === 4 && r2.added === 0, JSON.stringify({ dup: r2.dup.length, added: r2.added }));
  const all = run(exec(st, A), 'allLineRows()');
  ok('읽으면 4줄', all.length === 4, all.length + '줄 (시트 행 ' + run(exec(st, A), 'totalLines()') + ')');
  cases.forEach(([n, t], i) => ok(n + ' 원문 그대로', all[i] && all[i].text === t, all[i] && all[i].text.length + '자'));
  const p = post(exec(st, A), { action: 'poll', pw: 'pwA', since: 0 });
  ok('poll도 합쳐서', p.lines.length === 4 && p.lines.map(l => l.text).join('') === cases.map(c => c[1]).join(''));
  const last = p.lines[p.lines.length - 1]; const p2 = post(exec(st, A), { action: 'poll', pw: 'pwA', since: Math.max(...p.lines.map(l => l.last || l.id)) });
  ok('다음 poll은 새 줄 없음', p2.lines.length === 0);
  const h = post(exec(st, A), { action: 'history', pw: 'pwA', before: 6, limit: 3 });
  ok('이전 대화 쪽에서 긴 말 중간부터 읽어도 조각만 나오지 않음', h.lines.every(l => !/~c\d+$/.test(l.uid)));
  const big = post(exec(st, A), { action: 'lines', pw: 'pwA', items: [{ uid: 'H1', name: '철수', text: mk(1000001), t: new Date().toISOString() }] });
  ok('100만 자 넘는 말은 저장했다고 하지 않음', !big.saved.length && big.tooLong.length === 1);
  // 요약 구간이 긴 말을 쪼개지 않음
  const c = exec(st, A); run(c, 'processNow(true)');
  ok('긴 말이 있어도 요약이 끝까지', Number(run(exec(st, A), "getConf('processedId')")) === run(exec(st, A), 'totalLines()'));
}
done();
