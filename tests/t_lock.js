// 1. 같은 방의 기존 Room.gs 주소(라이브러리)와 엔진 ?room= 주소가 같은 쓰기 잠금을 쓰는지
// (가짜 환경의 잠금은 구글 문서대로 "라이브러리에서 만든 잠금은 모든 사용 스크립트가 같은 것을 본다"를 따른다. 실제 확인은 lockProbe)
const { makeStore, exec, room, run, post, ok, done } = require('./lib.js');
const st = makeStore(); const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ENG = 'https://script.google.com/macros/s/ENGINEabc/exec';
room(st, A, 'pwA'); run(exec(st, A), 'hostRoom()');
const L = (p, n) => Array.from({ length: n }, (_, i) => ({ uid: p + i, name: p === 'old' ? '철수' : '영희', session: '1', t: new Date().toISOString(), text: p + ' 주소로 한 말 ' + i }));
const viaOld = items => post(exec(st, A), { action: 'lines', pw: 'pwA', items });
const viaEng = items => post(exec(st, null, { serviceUrl: ENG }), { action: 'lines', pw: 'pwA', items }, { room: A });
post(exec(st, null, { serviceUrl: ENG }), { action: 'ping', pw: 'pwA' });   // 엔진 주소 기억
// ① 엔진 주소 실행이 잠금 안에서 쓰는 도중에, 기존 주소가 다른 발언을 쓰려고 함
{
  const cE = exec(st, null, { serviceUrl: ENG });
  cE.__mid = () => { const r = viaOld(L('old', 5)); cE.__midRes = r; Object.keys(st.cache).forEach(k => delete st.cache[k]); cE.__midRes2 = viaOld(L('old', 5)); };
  const r = run(cE, `roomUse('${A}'); withLock(25000, () => { __mid(); return 1; }); addLines({ items: ${JSON.stringify(L('eng', 5))} })`);
  ok('엔진 주소가 잠금을 잡은 동안 기존 주소 쓰기는 기다림(실패로 알려 기기에 남김)', !cE.__midRes.ok && !(cE.__midRes.saved || []).length, JSON.stringify(cE.__midRes).slice(0, 90));
  ok('캐시 표식을 모두 지워도 여전히 막힘', !cE.__midRes2.ok, JSON.stringify(cE.__midRes2).slice(0, 60));
  ok('엔진 주소 쪽은 저장', r.ok && r.saved.length === 5);
}
// ② 반대로 기존 주소가 잡고 있는 동안 엔진 주소
{
  const cO = exec(st, A);
  cO.__mid = () => { cO.__midRes = viaEng(L('eng2_', 5)); };
  run(cO, `withLock(25000, () => { __mid(); return 1; })`);
  ok('기존 주소가 잠금을 잡은 동안 엔진 주소 쓰기는 기다림', !cO.__midRes.ok, JSON.stringify(cO.__midRes).slice(0, 90));
}
// ③ 기기들이 다시 보냄 (실제 화면은 4초마다 재전송)
const r1 = viaOld(L('old', 5)), r2 = viaEng(L('eng2_', 5));
ok('잠금이 풀린 뒤 두 주소 모두 저장', r1.saved.length === 5 && r2.saved.length === 5);
// ④ 두 주소가 번갈아 아주 빠르게 쓰기 (20번)
for (let i = 0; i < 20; i++) { (i % 2 ? viaOld : viaEng)([{ uid: 'mix' + i, name: '민수', session: '1', t: new Date().toISOString(), text: '번갈아 ' + i }]); }
const rows = run(exec(st, A), 'allLineRows()');
const uids = rows.map(l => l.uid), ids = rows.map(l => l.id);
ok('모든 발언이 한 번씩, 덮어쓴 줄 없음', rows.length === 35 && new Set(uids).size === 35, rows.length + '줄');
ok('번호가 1부터 빈틈·겹침 없이', ids.every((v, i) => v === i + 1));
done();
