// 빈 방에 222줄(세션 1: 120줄, 세션 2: 102줄) → 자동 정리로 끝까지 따라잡는지
const { makeStore, exec, room, run, post, ok, done } = require('./lib.js');
const st = makeStore(); const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
room(st, A, 'pwA');
const names = ['키퍼', '철수', '영희', '민수', '지현'];
const items = []; const base = Date.parse('2026-11-21T10:00:00Z');
for (let i = 0; i < 222; i++) items.push({ uid: 'L' + i, name: names[i % 5], session: i < 120 ? '1' : '2', t: new Date(base + i * 7000).toISOString(), text: '발언 ' + i + ' 오래된 저택의 지하실에서 단서를 찾는다 ' + 'ㄱ'.repeat(i % 30) });
let saved = 0; for (let i = 0; i < items.length; i += 100) { const r = post(exec(st, A), { action: 'lines', pw: 'pwA', items: items.slice(i, i + 100) }); saved += r.saved.length; }
ok('222줄 저장', saved === 222, 'saved=' + saved);
run(exec(st, A), "setConf('keeperName','키퍼')");
let t0 = Date.now(), rounds = 0;
for (; rounds < 40; rounds++) {
  const c = exec(st, A);
  const r = run(c, 'processNow(true)');
  const p = Number(run(c, "getConf('processedId')")), q = run(c, 'notesQ().length');
  if (p === 222 && !q) break;
}
const c = exec(st, A);
const sums = run(c, `sheet(SH.SUM).getRange(2,1,Math.max(1,sheet(SH.SUM).getLastRow()-1),6).getValues()`);
const cited = new Set(); sums.forEach(r => (String(r[3]).match(/#(\d+)/g) || []).forEach(x => cited.add(Number(x.slice(1)))));
const missing = []; for (let i = 1; i <= 222; i++) if (!cited.has(i)) missing.push(i);
ok('처리 번호 222', Number(run(c, "getConf('processedId')")) === 222, 'rounds=' + rounds + ' ms=' + (Date.now() - t0));
ok('요약이 222줄을 빠짐없이 다룸(가짜 AI가 #번호를 그대로 적음)', !missing.length, '빠짐 ' + missing.length + ' ' + missing.slice(0, 10));
const sessOf = new Set(sums.map(r => String(r[0])));
ok('세션별 요약 1·2 모두', sessOf.has('1') && sessOf.has('2'), [...sessOf].join(','));
const notes = run(c, 'readNotes()');
ok('단서 정리 생김', notes && (notes.clues || []).length > 0, '단서 ' + (notes && notes.clues || []).length + '개');
ok('정리 대기·실패 0', run(c, 'notesQ().length') === 0 && run(c, 'notesFail().length') === 0);
console.log('AI 호출', st.aiCalls);
done();
