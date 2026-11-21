// 5차 검토에서 재현된 모순: 추천을 만든 뒤 새 말이 1줄 들어온 상태에서 보통 요청을 하면 서버가 fresh:true, behind:1로 답했다 ("다시 써도 된다"와 "최신이다"를 섞음)
// 고친 뒤: fresh = 추천 뒤 읽지 않은 새 기록·자료 변경이 없음 / reusable = 새로 만들지 않고 다시 써도 되는 범위(40줄 미만, 자료 그대로) / reused = 이 답이 받아 둔 추천임
const { makeStore, exec, room, run, post, ok, done, oldCode } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', names = ['키퍼', '철수', '영희'];
const NEXT = /다음에 해 볼 만한 것/;
const reply = tag => (sys) => NEXT.test(sys) ? JSON.stringify({ now: { scene: tag, just: tag, agreed: '', held: '' }, items: [{ kind: '행동', title: tag + ' 할 일', why: '', prio: 1, src: [], guess: false }] }) : '';
function world(code) {
  const st = makeStore(), ex = () => exec(st, A, code ? { code } : {}); let n = 0; const base = Date.now() - 900000;
  if (code) { const { makeBook } = require('./fakegas.js'); makeBook(st, A, '🎲TRPG Archive · CoC 방AAA'); run(ex(), "setup('pwA')"); } else room(st, A, 'pwA');
  run(ex(), "setConf('keeperName','키퍼')");
  const say = k => post(ex(), { action: 'lines', pw: 'pwA', items: Array.from({ length: k }, () => { n++; return { uid: 'F' + n, name: names[n % 3], session: '1', t: new Date(base + n * 5000).toISOString(), text: '서재에서 책장을 살핀다 ' + n }; }) });
  const next = force => post(ex(), { action: 'nextSteps', pw: 'pwA', force: !!force });
  return { st, ex, say, next };
}
const w = world();
w.say(10); w.st.aiReply = reply('처음');
const a = w.next();
ok('새로 만든 추천: fresh:true, reusable:true, reused:false, behind:0', a.ok && a.fresh === true && a.reusable === true && a.reused === false && a.behind === 0, JSON.stringify({ fresh: a.fresh, reusable: a.reusable, reused: a.reused, behind: a.behind }));
let calls = w.st.aiCalls;
const b = w.next();
ok('새 기록이 없을 때 다시 열면: 받아 둔 추천, 최신 맞음 (AI 호출 없음)', b.fresh === true && b.reusable === true && b.reused === true && b.behind === 0 && w.st.aiCalls === calls);
w.say(1);
const c = w.next();
ok('(재현 수정) 새 말 1줄 뒤 보통 요청: 받아 둔 추천을 다시 쓰되 최신이라고 하지 않음 (fresh:false, reusable:true, behind:1)', c.ok && c.fresh === false && c.reusable === true && c.reused === true && c.behind === 1 && w.st.aiCalls === calls && c.next.items[0].title === '처음 할 일', JSON.stringify({ fresh: c.fresh, reusable: c.reusable, reused: c.reused, behind: c.behind }));
w.say(38);
const d = w.next();
ok('새 말 39줄(40줄 미만): 여전히 다시 쓰고(reusable), 최신은 아님', d.fresh === false && d.reusable === true && d.reused === true && d.behind === 39 && w.st.aiCalls === calls);
run(w.ex(), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");      // 1분 제한과 상관없이 보려고 만든 시각을 옛날로
w.say(1); w.st.aiReply = reply('둘째');
const e = w.next();
ok('새 말 40줄: 다시 쓰지 않고 새로 만듦 (40줄 기준은 그대로), 새 추천은 최신', e.reused === false && e.fresh === true && e.behind === 0 && w.st.aiCalls === calls + 1 && e.next.items[0].title === '둘째 할 일', JSON.stringify({ reused: e.reused, fresh: e.fresh, behind: e.behind, calls: w.st.aiCalls - calls }));
// 자료가 바뀐 경우(북마크): 다시 쓰지 않고 새로 만든다 (키가 달라짐)
run(w.ex(), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");
run(w.ex(), "withLock(20000, () => bump('sumVer'))"); calls = w.st.aiCalls; w.st.aiReply = reply('셋째');
const f = w.next();
ok('추천 뒤 요약·북마크 번호가 바뀌면 받아 둔 추천을 최신이라고 하지 않고 새로 만듦', f.reused === false && w.st.aiCalls === calls + 1 && f.fresh === true);
// 1분 안 force: 받아 둔 것을 주되 최신 여부와 다시 쓰기 여부를 따로
w.say(2); calls = w.st.aiCalls;
const g = w.next(true);
ok('1분 안 force: wait, 받아 둔 추천, fresh:false(새 말 2줄), reusable:true', g.wait === true && g.reused === true && g.fresh === false && g.reusable === true && g.behind === 2 && w.st.aiCalls === calls);
// 다른 사람이 만드는 중(busy): 최신이라고 하지 않음
run(w.ex(), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");
run(w.ex(), "roomCache().put('nextBusy', '1', 150)");
const h = w.next(true);
ok('다른 사람이 만드는 중: busy, 받아 둔 추천은 최신 아님(fresh:false)이고 다시 쓰기 대상도 아님', h.busy === true && h.fresh === false && h.reusable === false && h.reused === true && h.behind === 2, JSON.stringify({ busy: h.busy, fresh: h.fresh, reusable: h.reusable, behind: h.behind }));
// 예전 판(.25)에서 이 모순이 실제로 있었는지 (시험이 진짜 문제를 보고 있는지 확인). git 기록이 없으면 돌리지 않는다
let OLD = null; try { OLD = oldCode('0753a0a'); } catch (err) { OLD = null; }
if (!OLD) console.log('SKIP 예전 판(.25)을 git 기록에서 꺼내지 못해 재현 시험 2개는 돌리지 않음 (미실행, 통과로 세지 않음)');
else {
  const o = world(OLD); o.say(10); o.st.aiReply = reply('옛'); o.next(); o.say(1);
  const r = o.next();
  ok('(재현) 예전 서버(.25)는 새 말 1줄 뒤에도 fresh:true, behind:1로 답함', r.fresh === true && r.behind === 1 && r.reusable === undefined, JSON.stringify({ fresh: r.fresh, behind: r.behind }));
  ok('예전 서버의 답에는 reused·reusable이 없음 → 새 화면은 behind로 최신 여부를 직접 판단 (화면 시험 round5에서 확인)', r.reused === undefined);
}
done();
