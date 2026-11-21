// 📜 세션 기록(대장 스타일): 공개 자료만 읽기, 같은 입력이면 다시 쓰기(요금 0), 근거 번호·끊김 안내 지우기, 초기화 뒤 버리기
const { makeStore, room, exec, run, post, ok, done } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const st = makeStore(); room(st, A, 'pwA'); const ex = () => exec(st, A);
run(ex(), "setConf('keeperName','달토끼')");
const base = Date.parse('2026-11-21T04:00:00Z');
post(ex(), { action: 'lines', pw: 'pwA', items: [1, 2, 3].map(i => ({ uid: 'L' + i, name: '철수', session: '1', t: new Date(base + i * 40 * 60000).toISOString(), text: '말 ' + i + ' 저택이 너무 조용하네요' })) });
run(ex(), "withLock(20000, () => { sheet(SH.SUM).appendRow(['1','2026-11-21 13:00:00','2026-11-21 13:30:00', enc('【서재】\\n- 집사가 맞이함 (#3)\\n- [판정] 철수 관찰력 성공 (#5)'),'','']); bump('sumVer'); })");
run(ex(), "withLock(20000, () => { const n = readNotes() || emptyNotes(); n.npcs = [{ id: 'n1', name: '집사 윌리엄', affil: '저택' }]; n.clues = [{ id: 'c1', text: '찢어진 일기', status: '미해결' }, { id: 'c2', text: '열쇠', status: '해결' }]; writeNotes(n); })");
run(ex(), "withLock(20000, () => { kbWrite(Object.assign(kbEmpty(), { truth: '비밀진상XYZ' })); })");
run(ex(), "withLock(20000, () => setJson('bookmarks', [{ sid: 2, text: '- 집사가 맞이함 (#3)', by: '영희', session: '1' }]))");
const REC = '비 오는 밤, 의뢰를 받고 외딴 저택에 도착함.\n' + '-'.repeat(47) + '서재\n-집사가 맞이함. (#3)\n※ 받아쓰기 끊김 약 20초\n--관찰력[성공]\n' + '-'.repeat(47);
const OUT = { title: 'CoC 방AAA', pcs: ['존(철수): 탐정. (#5)'], setting: '1920s', glance: { one: '서재 조사', ending: '진행 중.', mine: '존(철수): 관찰력 성공', keys: '[찢어진 일기]' }, body: REC, ending: '진행 중.', epilogue: [],
  memo: { npcs: ['집사 윌리엄: 맞이함.'], places: ['서재'], clues: ['[미해결] 찢어진 일기'], mine: ['관찰력 성공'], check: [],
    quotes: [{ who: '철수', text: '말 2 저택이 너무 조용하네요' }, { who: '철수', text: '나는 지어낸 대사를 했다' }, { who: '영희', text: '말 3 저택이 너무 조용하네요' }],
    dice: ['존(철수): 관찰력 성공'], relations: ['존 ↔ 집사: 경계 → 믿음'], carry: ['다음 회차로: 지하실'] } };
st.aiReply = (sys, text) => /세션 기록/.test(sys) ? JSON.stringify(OUT) : '';
const r = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '철수' });
const seen = st.lastAi ? st.lastAi.text + st.lastAi.system : '';
ok('기록을 만듦: 옛 구분선 모양은 -[서재]-로 바꾸고 끝 구분선은 지움, 근거 번호 (#3)·(#5)와 끊김 안내 줄도 지움 (빈 줄도 남기지 않음)', r.ok && r.body.includes('맞이함.\n--관찰력') && r.body.includes('\n-[서재]-\n') && !/-{20,}/.test(r.body) && r.body.endsWith('--관찰력[성공]') && !/\(#\d/.test(JSON.stringify(r)) && !/받아쓰기 끊김/.test(r.body) && r.pcs[0] === '존(철수): 탐정.', JSON.stringify(r).slice(0, 300));
ok('머리말 KP/PL 줄은 서버가 마스터 이름과 캐릭터 표로 만듦, 한눈에·메모는 AI 답 그대로', r.kp === 'KP: 달토끼 / PL: 철수' && r.glance.keys === '[찢어진 일기]' && r.memo.clues[0] === '[미해결] 찢어진 일기', r.kp);
ok('마스터 전용 자료(진상)는 AI에 보내지 않음', seen.length > 0 && !seen.includes('비밀진상XYZ'));
ok('AI에 보낸 것: 이번 세션 요약·NPC·북마크·마스터 이름·내보내는 사람, 요약의 근거 번호는 뺌', /집사가 맞이함/.test(seen) && /집사 윌리엄/.test(seen) && /달토끼/.test(seen) && /## 이 기록을 내보내는 사람\n철수/.test(seen) && !/\(#3\)/.test(seen));
ok('아카이브 메모: 실제 날짜, 북마크(누가)', r.date === '2026-11-21' && r.bms.length === 1 && r.bms[0].by === '영희', JSON.stringify({ d: r.date, b: r.bms }));
ok('명대사: 그 사람이 이 세션에서 실제로 한 말만 남김 (지어낸 말, 남의 말로 바꾼 것은 버림)', r.memo.quotes.length === 1 && r.memo.quotes[0].who === '철수' && r.memo.quotes[0].text === '말 2 저택이 너무 조용하네요', JSON.stringify(r.memo.quotes));
ok('AI에 실제 대사 일부를 보내고, 장소는 -[장소]- 모양으로 쓰라고 함', /## 실제 대사 일부[^]*철수: 말 1 저택이/.test(seen) && seen.includes('-[산타모니카 탐정 사무소]-') && !/-{47}/.test(seen));
const t0 = String(run(ex(), 'sheet(SH.LINES).getRange(2, 2).getValue()')).slice(11, 16), t1 = String(run(ex(), 'sheet(SH.LINES).getRange(4, 2).getValue()')).slice(11, 16);
ok('실제로 논 시간: 대화 시트의 첫 말~마지막 말 (40분 간격 세 줄 = 80분)', r.play && r.play.start === t0 && r.play.end === t1 && r.play.mins === 80, JSON.stringify(r.play));
ok('주사위·관계 변화·캠페인 이어 보기는 AI 답 그대로', r.memo.dice[0] === '존(철수): 관찰력 성공' && r.memo.relations.length === 1 && r.memo.carry[0] === '다음 회차로: 지하실');
const calls = st.aiCalls;
const r2 = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '철수' });
ok('같은 입력으로 다시 누르면 저장된 기록을 다시 씀 (AI 호출 없음)', r2.ok && r2.reused === true && st.aiCalls === calls && r2.body === r.body);
run(ex(), "withLock(20000, () => { sheet(SH.SUM).appendRow(['1','2026-11-21 13:30:00','2026-11-21 14:00:00', enc('【지하실】\\n- 문이 잠겨 있음'),'','']); bump('sumVer'); })");
const r3 = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '철수' });
ok('요약이 늘면 새로 만듦 (세션기록 시트에는 세션마다 한 줄)', r3.ok && r3.reused === false && st.aiCalls === calls + 1 && run(ex(), "sheet('세션기록').getLastRow()") === 2);
const r4 = post(ex(), { action: 'myRecord', pw: 'pwA', session: '2' });
ok('요약이 없는 세션은 AI를 부르지 않고 알려 줌', r4.ok && r4.empty && st.aiCalls === calls + 1);
const r5 = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1; x' });
ok('세션 번호가 아니면 거절', !r5.ok);
// 만드는 사이 초기화되면 저장하지 않음
st.aiReply = (sys) => { if (/세션 기록/.test(sys)) { run(ex(), "withLock(20000, () => bump('resetVer'))"); return JSON.stringify(OUT); } return ''; };
const r6 = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', force: true });
ok('만드는 사이 기록이 초기화되면 결과를 저장하지 않고 알려 줌', !r6.ok && r6.stale === true, JSON.stringify(r6).slice(0, 200));
st.aiReply = (sys) => /세션 기록/.test(sys) ? JSON.stringify(Object.assign({}, OUT, { memo: {} })) : '';
const r7 = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', force: true });
ok('AI가 메모를 비워 오면 정리의 단서 상태와 NPC로 채움', r7.ok && r7.memo.clues.includes('[미해결] 찢어진 일기') && r7.memo.clues.includes('[해결] 열쇠') && r7.memo.npcs[0].startsWith('집사 윌리엄'), JSON.stringify(r7.memo));
ok('방 비밀번호가 없으면 거절', !post(ex(), { action: 'myRecord', session: '1' }).ok);
done();
