// 🧭 다음 할 일: 아직 요약되지 않은 방금 한 말을 읽는지, 오래된 추천을 구별하는지, 초기화·세션 전환 중에 만든 추천을 저장하지 않는지
const { makeStore, exec, room, run, post, ok, done } = require('./lib.js');
const st = makeStore(); const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
room(st, A, 'pwA'); run(exec(st, A), "setConf('keeperName','키퍼')");
const names = ['키퍼', '철수', '영희', '민수', '지현'], base = Date.parse('2026-11-21T10:00:00Z'); let n = 0;
const say = (texts, sess) => post(exec(st, A), { action: 'lines', pw: 'pwA', items: texts.map(t => { n++; return { uid: 'N' + n, name: names[n % 5], session: sess || '1', t: new Date(base + n * 7000).toISOString(), text: t }; }) });
say(Array.from({ length: 30 }, (_, i) => '저택 현관에서 이야기한다 ' + i));
for (let k = 0; k < 5; k++) run(exec(st, A), 'processNow(true)');
ok('앞 30줄은 요약됨', Number(run(exec(st, A), "getConf('processedId')")) === 30);
// 요약 전 12줄: 방금 지하실에서 열쇠를 찾음 + 받아쓰기 끊김 안내 1줄
say(['지하실로 내려간다', '벽난로 뒤를 살핀다', '지하실에서 녹슨 열쇠를 발견했다!', '※ 받아쓰기 끊김 약 40초 (10:00:00~10:00:40, 연결 끊김). 이 사이 철수의 말은 기록되지 않았을 수 있어요'].concat(Array.from({ length: 8 }, (_, i) => '열쇠로 어디를 열지 상의한다 ' + i)));
st.aiReply = (sys, text) => /다음에 해 볼 만한 것/.test(sys) ? JSON.stringify({ now: { scene: '저택 지하실', just: '녹슨 열쇠를 발견', agreed: '', held: '' },
  items: [{ kind: '행동', title: '열쇠가 맞는 문을 찾는다', why: '방금 열쇠를 찾음', prio: 1, src: [33, 999], guess: false }, { kind: '장소', title: 'a', prio: 1 }, { kind: '장소', title: 'b', prio: 1 }, { kind: '장소', title: 'c', prio: 1 }, { kind: '준비', title: 'd', prio: 3, guess: true }] }) : '';
let calls = st.aiCalls || 0;
const r1 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
const sent = st.lastAi.text;
ok('요약 안 된 방금 한 말이 AI에 들어감', /## 방금 한 말[^]*#33 [^\n]*녹슨 열쇠를 발견/.test(sent));
ok('받아쓰기 끊김 안내 줄은 넣지 않음', !/받아쓰기 끊김/.test(sent.split('## 방금 한 말')[1] || ''));
ok('이미 요약된 줄은 원문으로 다시 넣지 않음', !/#30 /.test(sent.split('## 방금 한 말')[1] || ''));
ok('추천이 읽은 범위를 적음', r1.ok && r1.next && r1.next.basis.total === 42 && r1.next.basis.rawFrom === 31 && r1.next.basis.rawN === 11 && r1.next.basis.processedId === 30, JSON.stringify(r1.next && r1.next.basis));
ok('근거는 실제로 보낸 발언 번호만 (없는 #999는 버림)', JSON.stringify(r1.next.items[0].src) === '[33]');
ok('"지금 할 일"은 세 개까지', r1.next.items.filter(x => x.prio === 1).length === 3 && r1.next.items.length === 5);
ok('지금 장면·방금 일어난 일', r1.next.now.scene === '저택 지하실' && /열쇠/.test(r1.next.now.just) && r1.next.items[4].guess === true);
ok('마스터 자료는 보내지 않음', !/마스터 전용|사건의 진상/.test(sent));
calls = st.aiCalls;
const r2 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
ok('바뀐 게 없으면 AI를 다시 부르지 않음', r2.fresh && st.aiCalls === calls && r2.behind === 0);
say(Array.from({ length: 10 }, (_, i) => '문을 찾아다닌다 ' + i));
const r3 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
ok('10줄 더 쌓임: 받아 둔 추천 + 뒤처진 줄 수', st.aiCalls === calls && r3.behind === 10, 'behind=' + r3.behind);
say(Array.from({ length: 32 }, (_, i) => '서재 문이 열쇠로 열렸다 ' + i));
const r4 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
ok('40줄 넘게 쌓이면 새로 만듦', st.aiCalls === calls + 1 && r4.next.basis.total === 84, 'total=' + (r4.next && r4.next.basis.total));
// 북마크가 바뀌면 새로 만든다 (bookmark가 sumVer를 올린다)
const sid = run(exec(st, A), 'allData().summaries[0].id');
post(exec(st, A), { action: 'bookmark', pw: 'pwA', sid, text: '현관 이야기', name: '철수', session: '1' });
calls = st.aiCalls; const r5 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
ok('북마크가 바뀌면 새로 만듦', st.aiCalls === calls + 1 && /현관 이야기/.test(st.lastAi.text), 'calls +' + (st.aiCalls - calls));
// AI가 답하는 사이 세션이 넘어감 → 옛 세션으로 만든 추천을 저장하지 않는다
say(Array.from({ length: 45 }, (_, i) => '더 이야기한다 ' + i));
const before = run(exec(st, A), "getConf('nextSteps')");
const reply = st.aiReply; st.aiReply = (sys, text) => { if (/다음에 해 볼 만한 것/.test(sys)) run(exec(st, A), "withLock(20000, () => setConf('session', '2'))"); return reply(sys, text); };
const r6 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
ok('만드는 사이 세션이 바뀌면 저장하지 않음', r6.ok && r6.changed && !r6.next && run(exec(st, A), "getConf('nextSteps')") === before);
st.aiReply = (sys, text) => { if (/다음에 해 볼 만한 것/.test(sys)) run(exec(st, A), "withLock(20000, () => setConf('resetVer', '77'))"); return reply(sys, text); };
say(Array.from({ length: 6 }, (_, i) => '세션 2 시작 ' + i), '2');
run(exec(st, A), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");      // 방금 만든 추천은 1분 동안 다시 만들지 않으므로, 오래된 것으로 바꿔 둔다
const before7 = run(exec(st, A), "getConf('nextSteps')");
const r7 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
ok('만드는 사이 기록이 초기화되면 저장하지 않음', r7.ok && r7.changed && run(exec(st, A), "getConf('nextSteps')") === before7);
// 현황판 기준 시점: AI를 부르기 전에 읽은 줄 수
done();
