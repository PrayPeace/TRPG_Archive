// 🛰 떡밥 레이더: 가상 캠페인 10세션(tests/quality/campaign.js)을 넣고 정답표와 맞는지, '해당 없음'·'나중에'가 도는지, 플레이어가 숨기지 못하는지
const { makeStore, room, exec, run, post, ok, done } = require('./lib.js');
const { build } = require('./quality/campaign.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const st = makeStore(); room(st, A, 'pwA'); const ex = () => exec(st, A);
run(ex(), "setConf('keeperName','키퍼')");
const C = build(), base = Date.parse('2026-10-01T10:00:00Z');
// 세션 2개 전에는 후보가 없다
post(ex(), { action: 'lines', pw: 'pwA', items: C.sessions[1].map((l, i) => ({ uid: l.uid, name: l.name, session: '1', t: new Date(base + i * 9000).toISOString(), text: l.text })) });
const r0 = post(ex(), { action: 'radar', pw: 'pwA' });
ok('세션이 하나뿐이면 후보 없음', r0.ok && r0.items.length === 0);
for (let s = 2; s <= C.N; s++) post(ex(), { action: 'lines', pw: 'pwA', items: C.sessions[s].map((l, i) => ({ uid: l.uid, name: l.name, session: String(s), t: new Date(base + s * 7 * 864e5 + i * 9000).toISOString(), text: l.text })) });
run(ex(), 'withLock(20000, () => writeNotes(' + JSON.stringify(Object.assign({}, C.notes)) + '))');
// 마스터 자료에만 있는 이름은 레이더에 나오면 안 된다
run(ex(), "withLock(20000, () => { kbWrite(Object.assign(kbEmpty(), { truth: '비밀NPC 바다의 사제 마르코' })); })");
const r = post(ex(), { action: 'radar', pw: 'pwA' });
const ids = k => r.items.filter(x => x.kind === k).map(x => x.id).sort();
const want = C.key.radar;
ok('지금 세션 = 10', r.cur === '10' && r.sessions === 10, r.cur);
ok('오래 안 나온 NPC = 정답표와 같음 (' + want.npc.map(x => x.id).join(',') + ')', JSON.stringify(ids('npc')) === JSON.stringify(want.npc.map(x => x.id).sort()), JSON.stringify(ids('npc')));
ok('오래된 미해결 단서 = 정답표와 같음 (' + want.clue.map(x => x.id).join(',') + ')', JSON.stringify(ids('clue')) === JSON.stringify(want.clue.map(x => x.id).sort()), JSON.stringify(ids('clue')));
ok('뜨면 안 되는 것(최근에 나옴·풀림)은 하나도 없음', !r.items.some(x => want.notNpc.concat(want.notClue).some(w => w.id === x.id)));
ok('지난 세션 수가 정답표와 같음', r.items.every(x => (want[x.kind].find(w => w.id === x.id) || {}).gap === x.gap), JSON.stringify(r.items.map(x => x.id + ':' + x.gap)));
ok('오래된 순서로 정렬', r.items.every((x, i) => !i || r.items[i - 1].gap >= x.gap));
const np1 = r.items.find(x => x.id === 'np1');
ok('근거: 처음·마지막으로 나온 줄 (세션 1, 세션 3)', np1 && np1.ev.length === 2 && np1.ev[0].s === '1' && np1.ev[1].s === '3' && /한씨/.test(np1.ev[1].text) && np1.last === '3', JSON.stringify(np1 && np1.ev));
const cl2 = r.items.find(x => x.id === 'cl2');
ok('단서 근거: 발견한 줄', cl2 && cl2.ev[0].s === '2' && /항해일지/.test(cl2.ev[0].text) && /세션 2/.test(cl2.why), JSON.stringify(cl2));
ok('마스터 자료는 보지 않음', !/마르코|비밀NPC/.test(JSON.stringify(r)));
// 요약에만 이름이 나와도 나온 것으로 친다 (어부 김돌이 세션 9 요약에 나옴 → 1세션째)
run(ex(), "withLock(20000, () => { sheet(SH.SUM).appendRow(['9','2026-11-26 10:00:00','2026-11-26 11:00:00', enc('- 김돌이 배를 띄웠다는 소문을 들음'),'','']); })");
const r1 = post(ex(), { action: 'radar', pw: 'pwA' });
ok('요약에 이름이 나와도 나온 것으로 침 (김돌 빠짐)', r1.items.every(x => x.id !== 'np3') && r1.items.some(x => x.id === 'np1'));
// 플레이어는 숨길 수 없다
const pr = post(ex(), { action: 'kRadarOff', pw: 'pwA', key: 'npc:np1', st: 'off' });
ok('플레이어는 "해당 없음"을 못 누름', !pr.ok && post(ex(), { action: 'radar', pw: 'pwA' }).items.some(x => x.id === 'np1'));
ok('이상한 항목 이름은 거절', run(ex(), "kRadarOff('../x', 'off')").ok === false && run(ex(), "kRadarOff('npc:np1', 'zzz')").ok === false);
// 마스터: 해당 없음 → 숨김 / 되돌리기
run(ex(), "kRadarOff('npc:np1', 'off')");
const r2 = post(ex(), { action: 'radar', pw: 'pwA' });
ok('"해당 없음"을 누르면 목록에서 빠지고 숨긴 목록에 남음', !r2.items.some(x => x.id === 'np1') && r2.hidden.some(h => h.key === 'npc:np1' && h.off === 'off'));
run(ex(), "kRadarOff('npc:np1', '')");
ok('되돌리면 다시 보임', post(ex(), { action: 'radar', pw: 'pwA' }).items.some(x => x.id === 'np1'));
// 나중에: 지금 세션 동안만 숨김, 다음 세션이 시작되면 다시 보임
run(ex(), "kRadarOff('clue:cl4', 'later')");
ok('"나중에"는 이번 세션 동안 숨김', !post(ex(), { action: 'radar', pw: 'pwA' }).items.some(x => x.id === 'cl4'));
post(ex(), { action: 'lines', pw: 'pwA', items: [{ uid: 'S11a', name: '키퍼', session: '11', t: new Date(base + 90 * 864e5).toISOString(), text: '새 세션을 시작합니다.' }] });
const r3 = post(ex(), { action: 'radar', pw: 'pwA' });
ok('다음 세션이 시작되면 다시 보이고 지난 세션 수도 늘어남', r3.cur === '11' && (r3.items.find(x => x.id === 'cl4') || {}).gap === 6, JSON.stringify(r3.items.map(x => x.id + ':' + x.gap)));
// 받아쓰기 끊김 안내 줄만 있는 세션은 세지 않는다
post(ex(), { action: 'lines', pw: 'pwA', items: [{ uid: 'S12a', name: '철수', session: '12', t: new Date(base + 97 * 864e5).toISOString(), text: '※ 받아쓰기 끊김 약 12초 (21:14:02~21:14:14, 연결 끊김). 이 사이 철수의 말은 기록되지 않았을 수 있어요' }] });
ok('끊김 안내 줄만 있는 세션은 세지 않음', post(ex(), { action: 'radar', pw: 'pwA' }).cur === '11');
// 근거 줄이 없는 단서는 고르지 않는다 (언제 나왔는지 모르므로)
run(ex(), "withLock(20000, () => { const n = readNotes(); n.clues.push({ id: 'clX', text: '근거 없는 단서', status: '미해결', src: [] }); writeNotes(n); })");
ok('근거 줄이 없는 단서는 고르지 않음', !post(ex(), { action: 'radar', pw: 'pwA' }).items.some(x => x.id === 'clX'));
// 채점 도구(campaign-score.js)가 맞게 세는지: 정답대로 쓴 요약은 합격, 틀린 요약은 불합격. (실제 Claude 점수가 아니다)
const { score } = require('./quality/campaign-score.js'), { CLUES: CL } = require('./quality/campaign.js');
const good = {}; for (let s = 1; s <= C.N; s++) { const k = C.key.perSession[s]; good[s] = ['【' + k.scene + '】'].concat(k.npcs.map(n => '- ' + n + '를 만남'), k.found.map(f => '- ' + CL.find(c => c.id === f.id).text + ' 발견'), k.solved.map(f => '- ' + CL.find(c => c.id === f.id).text + '의 정체가 밝혀짐'), k.rolls.map(x => '- [판정] ' + x.pc + ' ' + x.skill + ' ' + x.result)).join('\n'); }
const sg = score({ summaries: good, notes: C.notes, radar: r });
ok('채점 도구: 정답대로 쓴 요약·정리·레이더는 자동 채점 합격', /합격/.test(sg.verdict) && !/불합격/.test(sg.verdict) && sg.totals.npcRecall === 100 && sg.totals.radarRecall === 100 && !sg.totals.radarExtra.length, JSON.stringify(sg.totals));
const bad = Object.assign({}, good); bad[3] = bad[3].replace('듣기 성공', '듣기 실패').replace('- 등대지기 한씨를 만남\n', '') + '\n- 다음 주 토요일에 모이기로 함'; bad[7] = '';
const sb = score({ summaries: bad, notes: { clues: C.notes.clues.map(c => Object.assign({}, c, { status: c.id === 'cl2' ? '해결' : c.status })) }, radar: { items: r.items.slice(1).concat([{ kind: 'npc', title: '박영감 촌장' }]) } });
ok('채점 도구: 판정 뒤바뀜·함정·NPC 빠짐·빈 세션·상태 틀림·레이더 빠짐/엉뚱한 후보를 셈', sb.totals.rollFlip === 1 && sb.totals.traps === 1 && sb.sessions[3].npcMissing.includes('등대지기 한씨') && sb.totals.emptySessions.includes('7') && sb.totals.statusWrong.some(x => x.id === 'cl2') && sb.totals.radarRecall < 100 && sb.totals.radarExtra.includes('npc:박영감 촌장') && /확인 못 함/.test(sb.verdict), JSON.stringify(sb.totals));
done();
