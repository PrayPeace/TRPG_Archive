// 4. 중앙 엔진: 기존 캠페인 사본 두 개(A, B)로 검증
const { makeStore, makeBook, exec, room, run, post, ok, done } = require('./lib.js');
const vm = require('vm');
const st = makeStore();
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', B = '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ENG = 'https://script.google.com/macros/s/ENGINEabc/exec';
// 기존 방식으로 쓰던 캠페인 두 개 (각자 기록이 있음)
room(st, A, 'pwA'); room(st, B, 'pwB');
const mkItems = (p, n, s) => Array.from({ length: n }, (_, i) => ({ uid: p + i, name: ['키퍼', '철수', '영희'][i % 3], session: s || '1', t: new Date(Date.parse('2026-11-20T10:00:00Z') + i * 5000).toISOString(), text: p + ' 기존 발언 ' + i }));
post(exec(st, A), { action: 'lines', pw: 'pwA', items: mkItems('a', 80) });
post(exec(st, B), { action: 'lines', pw: 'pwB', items: mkItems('b', 50) });
// 엔진으로 등록 (방 시트에서 hostThisRoom → TRPG.hostRoom)
run(exec(st, A), `hostRoom()`); run(exec(st, B), `hostRoom()`);
const E = () => exec(st, null, { serviceUrl: ENG });   // 엔진 웹 앱 실행 (방 시트 없음)
const P = (b, room) => post(E(), b, room ? { room } : {});
let r = P({ action: 'ping', pw: 'pwA' }); ok('room 없으면 엔진 안내', !r.ok && r.engine);
ok('엔진 주소 기억 → 방 주소', run(E(), `hostedUrl('${A}')`) === ENG + '?room=' + A);
r = P({ action: 'ping', pw: 'pwA' }, A); ok('A 비번 → A 방', r.ok && /AAA/.test(r.title)); const ptA = r.pt;
r = P({ action: 'ping', pw: 'pwB' }, B); ok('B 비번 → B 방', r.ok && /BBB/.test(r.title)); const ptB = r.pt;
ok('A 비번으로 B 방 안 열림', !P({ action: 'ping', pw: 'pwA' }, B).ok);
ok('A 기기 토큰으로 B 자료 안 열림', !P({ action: 'data', pt: ptA }, B).ok && !P({ action: 'poll', pt: ptA, since: 0 }, B).ok);
ok('A 토큰으로 A 자료는 열림', P({ action: 'poll', pt: ptA, since: 0 }, A).lines.length > 0);
ok('등록 안 된 시트 거부', !P({ action: 'ping', pw: 'x' }, '1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC').ok);
// 방 식별 실패 시 공통 키를 쓰지 않음
{ const c = E(); let err = ''; try { run(c, 'roomCache().put("z","1",10)'); } catch (e) { err = e.message; }
  ok('방을 모르면 캐시를 쓰지 않고 멈춤', /방 시트를 찾지 못했/.test(err) && !Object.keys(st.cache).some(k => k.startsWith('x:')), err); }
ok('캐시 키는 모두 방 ID로 시작', Object.keys(st.cache).every(k => k.startsWith(A) || k.startsWith(B) || !k.includes(':')), Object.keys(st.cache).filter(k => !(k.startsWith(A) || k.startsWith(B))).slice(0, 3).join(','));
// A 방이 저장 잠금을 오래 잡고 있어도 B 방 받아쓰기는 저장됨 (엔진 방식: 방마다 잠금)
{
  const cA = E(); run(cA, `roomUse('${A}'); var __L = roomLock(); __L.tryLock(1000);`);   // A: 요약 반영 중(잠금 잡음)
  const t0 = Date.now();
  const rb = P({ action: 'lines', pw: 'pwB', items: mkItems('bn', 30, '2') }, B);
  const tb = Date.now() - t0;
  ok('A가 잠금을 잡고 있어도 B 저장', rb.ok && rb.saved.length === 30, 'B 저장 ' + rb.saved.length + '줄 ' + tb + 'ms');
  const t1 = Date.now(); const ra = P({ action: 'lines', pw: 'pwA', items: mkItems('an', 1, '2') }, A);
  ok('같은 A 방 저장은 A 잠금을 기다림(못 잡으면 실패로 알려 기기에 남김)', !ra.ok || (ra.saved || []).length === 0, JSON.stringify(ra).slice(0, 120) + ' ' + (Date.now() - t1) + 'ms');
  run(cA, '__L.releaseLock()');
  const ra2 = P({ action: 'lines', pw: 'pwA', items: mkItems('an', 1, '2') }, A);
  ok('A 잠금이 풀리면 A 저장', ra2.ok && ra2.saved.length === 1);
}
// tickAll: A 요약이 느려도(가짜 AI 지연) B도 같은 차례에 처리, 방별 처리 시간
{
  st.aiDelay = null;
  const times = {}; const c = E();
  run(c, `var __t={}; var __tick=tick; tick=function(){ const t=Date.now(); __tick(); __t[ssId()]=(__t[ssId()]||0)+Date.now()-t; };`);
  run(c, 'tickAll()');
  const t = run(c, '__t');
  const pa = Number(run(exec(st, A), "getConf('processedId')")), pb = Number(run(exec(st, B), "getConf('processedId')"));
  ok('tickAll 한 번에 두 방 모두 정리', pa === 81 && pb === 80, 'A 처리 ' + pa + '/81, B ' + pb + '/80, 방별 ms ' + JSON.stringify(t));
}
// 기존 Room.gs 주소(라이브러리 방식)도 그대로
ok('기존 방식 주소도 그대로', post(exec(st, A), { action: 'ping', pw: 'pwA' }).ok);
ok('방 시트 코드로 온 요청은 room 값 무시', /AAA/.test(post(exec(st, A), { action: 'ping', pw: 'pwA' }, { room: B }).title));
// 주소 전환: 기존 주소로 못 보낸 말 3줄을 새 주소로 바꾼 뒤 보낸다 → 원래 방에 정확히 한 번
{
  const items = mkItems('q', 3, '2');
  post(exec(st, A), { action: 'lines', pw: 'pwA', items: items.slice(0, 1) });    // 1줄은 이미 저장됐는데 응답이 끊김
  const r1 = post(exec(st, A), { action: 'lines', pw: 'pwA', items });            // 기존 주소로 다시
  const r2 = P({ action: 'lines', pw: 'pwA', items }, A);                          // 새 주소로도 (두 탭에서 동시에 남은 경우)
  const rows = run(exec(st, A), 'allLineRows()').filter(l => /^q\d$/.test(l.uid));
  ok('기존 주소·새 주소로 모두 보내도 원래 방에 정확히 한 번', rows.length === 3 && new Set(rows.map(l => l.uid)).size === 3, '저장 ' + rows.length + '줄');
  const inB = run(exec(st, B), 'allLineRows()').filter(l => /^q\d$/.test(l.uid)).length;
  ok('다른 방(B)에는 들어가지 않음', inB === 0);
}
done();
