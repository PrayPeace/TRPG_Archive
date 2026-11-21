// 4차 검토에서 재현된 결함: (1) 세션이 넘어간 직후 1분 안에 "다시 추천"을 누르면 지난 세션 추천이 돌아옴 (2) 가장 새 말이 6,000자를 넘으면 원문 범위가 통째로 빔
// 그리고 추천이 실제로 읽은 범위(basis), 만드는 사이 요약이 바뀐 경우, 현황판이 다른 회차에 저장되지 않는지
const { makeStore, exec, room, run, post, ok, done } = require('./lib.js');
const st = makeStore(); const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
room(st, A, 'pwA'); run(exec(st, A), "setConf('keeperName','키퍼')");
const names = ['키퍼', '철수', '영희', '민수', '지현'], base = Date.parse('2026-11-21T10:00:00Z'); let n = 0;
const say = (texts, sess) => post(exec(st, A), { action: 'lines', pw: 'pwA', items: texts.map(t => { n++; return { uid: 'M' + n, name: names[n % 5], session: sess || '1', t: new Date(base + n * 7000).toISOString(), text: t }; }) });
const NEXT = /다음에 해 볼 만한 것/;
const reply = tag => (sys, text) => NEXT.test(sys) ? JSON.stringify({ now: { scene: tag + ' 장면', just: tag, agreed: '', held: '' }, items: [{ kind: '행동', title: tag + ' 할 일', why: '', prio: 1, src: [], guess: false }] }) : '';
say(Array.from({ length: 12 }, (_, i) => '세션 1: 저택 현관에서 이야기한다 ' + i));
st.aiReply = reply('세션1');
const a1 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' });
ok('세션 1 추천을 만듦 (회차와 초기화 번호를 함께 저장)', a1.ok && a1.next && a1.next.items[0].title === '세션1 할 일' && a1.next.sess === '1' && a1.next.rv != null);

// (1) 세션 2로 넘어간 직후(1분 안) 다시 추천
const ns = JSON.parse(run(exec(st, A), 'JSON.stringify(newSession())'));
ok('세션 2 시작', ns.ok && ns.session === '2');
say(Array.from({ length: 6 }, (_, i) => '세션 2: 항구 창고에 도착했다 ' + i), '2');
st.aiReply = reply('세션2');
let calls = st.aiCalls;
const a2 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
ok('세션 전환 직후 force: 지난 세션 추천을 돌려주지 않음', a2.ok && (!a2.next || a2.next.sess === '2') && !(a2.next && /세션1/.test(JSON.stringify(a2.next))), JSON.stringify(a2).slice(0, 160));
ok('세션 전환 직후 force: 1분 제한에 걸리지 않고 새로 만듦', !a2.wait && st.aiCalls === calls + 1 && a2.next && a2.next.items[0].title === '세션2 할 일' && a2.fresh === true);
ok('새 추천은 세션 2 말만 읽음', !/세션 1: 저택 현관/.test((st.lastAi.text.split('## 방금 한 말')[1]) || '') && /세션 2: 항구 창고/.test(st.lastAi.text));
// force 없이 열어도 지난 세션 추천은 나오지 않는다 (세션 3으로 넘기고 AI가 실패하는 경우)
run(exec(st, A), 'newSession()');
st.aiFail = (sys) => NEXT.test(sys) ? 'AI 실패' : '';
let a3; try { a3 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA' }); } catch (e) { a3 = { ok: false }; }
ok('세션 3에서 AI가 실패해도 세션 2 추천을 대신 내놓지 않음', !(a3 && a3.next && a3.next.sess !== '3'), JSON.stringify(a3).slice(0, 120));
st.aiFail = null;
// 같은 세션에서는 1분 제한이 그대로 (받아 둔 것을 돌려주되, 그 뒤 새 말이 있으면 최신이라고 하지 않음)
say(Array.from({ length: 6 }, (_, i) => '세션 3: 등대로 올라간다 ' + i), '3');
st.aiReply = reply('세션3'); const b1 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
say(['세션 3: 등대 꼭대기에서 불빛을 봤다'], '3'); calls = st.aiCalls;
const b2 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
ok('같은 세션 1분 안 force: 받아 둔 추천, 새 말 1줄이 있어 최신 아님', b1.fresh === true && b2.wait === true && st.aiCalls === calls && b2.behind === 1 && b2.fresh === false && b2.next.sess === '3');

// (2) 가장 새 말이 6,000자를 넘는 경우
run(exec(st, A), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");
const head = '머리말: 지하 금고의 번호는 삼칠이일이다. ', tail = ' 꼬리말: 그러니 내일 아침 등대지기를 만나러 가자.';
const big = head + '가'.repeat(7000) + tail;
say(['세션 3: 짧은 말 하나', big], '3');
const c1 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
const rawSent = (st.lastAi.text.split('## 방금 한 말')[1]) || '';
ok('6,000자 넘는 최신 발언: 원문 범위가 비지 않음', c1.ok && c1.next && c1.next.basis.rawN >= 1 && c1.next.basis.rawTo === n, JSON.stringify(c1.next && c1.next.basis));
ok('긴 말의 앞과 끝이 모두 AI에 들어감', rawSent.indexOf('지하 금고의 번호는 삼칠이일') >= 0 && rawSent.indexOf('등대지기를 만나러 가자') >= 0 && /가운데 \d+자 줄임/.test(rawSent));
ok('줄여 보낸 말 수를 적음 (다 읽었다고 하지 않음)', c1.next.basis.rawCut === 1);
ok('보낸 원문은 6,000자 예산 근처', rawSent.length < 7500, 'len=' + rawSent.length);
ok('보낸 번호 범위 rawFrom~rawTo와 읽지 못한 줄 수', c1.next.basis.rawFrom >= 1 && c1.next.basis.rawFrom <= c1.next.basis.rawTo && c1.next.basis.rawSkip === Math.max(0, c1.next.basis.rawFrom - 1 - c1.next.basis.processedId), JSON.stringify(c1.next.basis));
// 긴 말이 여러 줄이면: 가장 새 것은 반드시, 나머지는 예산 안에서만. 못 읽은 줄 수가 basis에 남는다
run(exec(st, A), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");
say(Array.from({ length: 30 }, (_, i) => '긴 말 ' + i + ' ' + '나'.repeat(500)), '3');
const c2 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
ok('예산을 넘는 앞쪽 말은 보내지 않고 rawSkip에 적음', c2.next.basis.rawN < 30 && c2.next.basis.rawTo === n && c2.next.basis.rawSkip > 0 && c2.next.basis.rawSkip === c2.next.basis.rawFrom - 1 - c2.next.basis.processedId, JSON.stringify(c2.next.basis));

// (3) 만드는 사이 요약이 바뀜 → 저장은 하되 최신이라고 하지 않는다
run(exec(st, A), "withLock(20000, () => { const o = confJson('nextSteps', null); o.t = 1; setJson('nextSteps', o); })");
const r3 = reply('세션3');
st.aiReply = (sys, text) => { if (NEXT.test(sys)) run(exec(st, A), "withLock(20000, () => bump('sumVer'))"); return r3(sys, text); };
const d1 = post(exec(st, A), { action: 'nextSteps', pw: 'pwA', force: true });
ok('만드는 사이 요약 번호가 바뀌면 fresh:false, moved:true', d1.ok && d1.next && d1.fresh === false && d1.moved === true && d1.next.basis.sumVer != null);
st.aiReply = reply('세션3');

// (4) 현황판: AI가 답하는 사이 회차가 넘어가면 저장하지 않는다
run(exec(st, A), "kbWrite(Object.assign(kbEmpty(), { truth: '진상', clues: [{ id: 'k1', text: '단서 하나' }] }))");
st.aiReply = (sys, text) => /진행 현황판/.test(sys) ? JSON.stringify({ found: [], missing: [], hints: [], warnings: [] }) : '';
const k1 = run(exec(st, A), "JSON.stringify(kBoard(false, '등대'))"); const K1 = JSON.parse(k1);
ok('현황판에 판단 시점의 회차·장면·기록 범위를 적음', K1.ok && K1.board.basis.session === '3' && K1.board.basis.scene === '등대' && K1.board.basis.total === n, JSON.stringify(K1.board && K1.board.basis));
const logN = () => Number(run(exec(st, A), "sheet(SH.KLOG).getLastRow()"));
const l0 = logN();
st.aiReply = (sys, text) => { if (/진행 현황판/.test(sys)) run(exec(st, A), "withLock(20000, () => setConf('session', '4'))"); return /진행 현황판/.test(sys) ? JSON.stringify({ found: [], missing: [], hints: [], warnings: [] }) : ''; };
const K2 = JSON.parse(run(exec(st, A), "JSON.stringify(kBoard(false, '등대'))"));
ok('현황판을 만드는 사이 회차가 넘어가면 저장하지 않음', K2.ok === false && K2.stale === true && /회차/.test(K2.error) && logN() === l0, JSON.stringify(K2).slice(0, 120));

// (5) 판 확인 주소: 자동 정리가 마지막으로 돈 판을 함께 알려 준다
run(exec(st, A), 'tick()');
const v = JSON.parse(run(exec(st, A), "JSON.stringify(doGet({parameter:{action:'ver'}}))"));
ok('?action=ver: 엔진 판과 자동 정리가 돈 판', v.ok && /^\d{4}-\d\d-\d\d\.\d+$/.test(v.ver) && v.tick && v.tick.ver === v.ver && v.tick.at > 0, JSON.stringify(v));
done();
