// 🔍 찾기 창(Ctrl+K)과 🛰 떡밥 레이더 화면: 초성 찾기, 키보드로 고르기, 마스터 자료는 찾기에 안 나옴, 레이더 근거·해당 없음 버튼
const { chromium } = require('playwright'); const { open, ok, done, baseData, V } = require('./harness.js');
const notes = { places: [{ id: 'p1', name: '안개 등대', aka: '등대', desc: '마을 끝 바위 위' }], pcs: [{ id: 'q1', name: '박형사', player: '철수' }], handouts: [],
  npcs: [{ id: 'np1', name: '등대지기 한씨', aka: '한씨', affil: '등대' }, { id: 'np4', name: '박영감 촌장', aka: '촌장' }],
  clues: [{ id: 'cl2', text: '선장의 항해일지에서 찢겨 나간 마지막 장', status: '미해결' }], deleted: {} };
const lines = [{ id: 1, time: '2026-11-20 20:00:01', session: '1', name: '키퍼', text: '안개가 짙어집니다.', uid: 'a1' }, { id: 2, time: '2026-11-20 20:00:09', session: '1', name: '영희', text: '은화를 주머니에 넣어요.', uid: 'a2' }];
const radar = { ok: true, cur: '10', sessions: 10, more: 0, hidden: [{ key: 'clue:cl9', kind: 'clue', title: '숨긴 단서', off: 'off' }], items: [
  { key: 'npc:np1', kind: 'npc', id: 'np1', title: '등대지기 한씨', gap: 7, first: '1', last: '3', why: '세션 3 뒤로 7세션째 안 나왔어요', ev: [{ s: '1', t: '2026-10-01 10:00', who: '키퍼', text: '등대지기 한씨가 나타나 말을 겁니다.', uid: 'cp1_5' }, { s: '3', t: '2026-10-22 10:00', who: '민수', text: '한씨에게 더 물어봅니다.', uid: 'cp3_61' }] }] };
(async () => {
  const b = await chromium.launch();
  const S = { off: [], evid: [] };
  const handle = (a, j) => {
    if (a === 'data') return Object.assign(baseData(), { notes, summaries: [{ id: 2, session: '1', from: '2026-11-20 20:00:00', to: '2026-11-20 20:30:00', text: '【등대】\n- 일행이 젖은 발자국을 발견함 (#3)', seg: '' }], characters: [{ name: '토머스', player: '대장', occupation: '의사' }] });
    if (a === 'poll') return { ok: true, v: Object.assign({}, V, { total: 2 }), lines, presence: [], from: 0 };
    if (a === 'kData') return { ok: true, kb: { truth: '비밀진상 마르코가 범인', npcs: [{ name: '사제 마르코' }], places: [], clues: [], rolls: [], scenes: [], done: [], deleted: {} }, sources: [], pending: 0, chunks: 1, board: null, recaps: [], awardsLogs: [], feedbacks: [], npcLog: [], rollLog: [], recap: null, awards: null, rollsTotal: 0, sessions: [], session: '1', keeperName: '대장', resetVer: '1', kbGen: '0', weak: false, code: '' };
    if (a === 'radar') return radar;
    if (a === 'kRadarOff') { S.off.push(j); return { ok: true }; }
    if (a === 'evidence') { S.evid.push(j); return { ok: true, lines: [{ id: 5, name: '키퍼', text: '등대지기 한씨가 나타나 말을 겁니다.', focus: true }, { id: 6, name: '민수', text: '안녕하세요', focus: false }], missing: [] }; }
    return null;
  };
  const { p, errs } = await open(b, { handle, session: { t_kt: 'KT1' } });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { cfg.kt = 'KT1'; if (typeof kLoad === 'function') return kLoad(); });   // 마스터로 로그인한 화면 (시험 틀이 입장할 때 토큰을 지우므로 여기서 넣는다) await p.waitForTimeout(300);
  // 초성 맞추기
  const m = await p.evaluate(() => [findAt(findNorm('등대지기 한씨'), 'ㅎㅆ'), findAt(findNorm('등대지기 한씨'), 'ㄷㄷㅈㄱ'), findAt(findNorm('한기자'), '한ㄱ'), findAt(findNorm('한기자'), 'ㅎㅆ'), findAt(findNorm('Hello World'), 'oworld')]);
  ok('초성 맞추기: ㅎㅆ→한씨, ㄷㄷㅈㄱ→등대지기, 한ㄱ→한기자, 안 맞으면 -1, 띄어쓰기·대소문자 무시', JSON.stringify(m) === '[4,0,0,-1,4]', JSON.stringify(m));
  // Ctrl+K로 열기
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150);
  ok('Ctrl+K로 찾기 창이 열리고 입력 칸에 커서', await p.evaluate(() => !document.getElementById('finder').classList.contains('hide') && document.activeElement && document.activeElement.id === 'findIn'));
  await p.keyboard.type('ㅎㅆ'); await p.waitForTimeout(100);
  const first = await p.evaluate(() => [...document.querySelectorAll('#findList .fitem')].map(x => x.textContent));
  ok('초성 "ㅎㅆ"로 NPC 한씨가 맨 위', first.length && /등대지기 한씨/.test(first[0]) && /NPC/.test(first[0]), JSON.stringify(first));
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  ok('Enter → 그 NPC 창이 열림', await p.evaluate(() => !document.getElementById('modal').classList.contains('hide') && /등대지기 한씨/.test(document.getElementById('modalBody').textContent) && document.getElementById('finder').classList.contains('hide')));
  await p.evaluate(() => closeModal());
  // 화살표로 고르기 + 회의록 줄로 가기
  await p.keyboard.press('Control+k'); await p.keyboard.type('은화'); await p.waitForTimeout(100);
  const r2 = await p.evaluate(() => findSt.res.map(x => x.kind));
  ok('회의록 줄도 찾음', r2.includes('회의록'), JSON.stringify(r2));
  const idx = r2.indexOf('회의록');
  for (let i = 0; i < idx; i++) await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('회의록 줄을 고르면 회의록 탭으로 가서 그 줄을 표시 (깜빡이지 않는 표시)', await p.evaluate(() => !document.getElementById('t-log').classList.contains('hide') && !!document.querySelector('#log span[data-id="2"].fhit')));
  // 요약 줄·탭 이름
  await p.keyboard.press('Control+k'); await p.keyboard.type('ㅂㅈㄱ'); await p.waitForTimeout(100);
  ok('요약 줄을 초성으로 찾음 (ㅂㅈㄱ → 발자국)', await p.evaluate(() => findSt.res.some(x => x.kind === '요약' && /발자국/.test(x.title))));
  await p.fill('#findIn', '설정'); await p.waitForTimeout(100);
  ok('탭 이름으로도 감', await p.evaluate(() => findSt.res[0] && findSt.res[0].kind === '탭'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok('Esc로 닫힘', await p.evaluate(() => document.getElementById('finder').classList.contains('hide')));
  // 마스터 자료는 마스터로 로그인해 있어도 찾기에 넣지 않는다
  const leak = await p.evaluate(() => { const ix = findIndex(); return { n: ix.length, hit: JSON.stringify(ix.map(x => [x.title, x.aka, x.body, x.sub])).match(/마르코|비밀진상/) }; });
  ok('마스터 자료(진상·비밀 NPC)는 찾기 목록에 없음 (마스터 로그인 상태)', leak.n > 5 && !leak.hit, JSON.stringify(leak));
  await p.click('#findBtn'); await p.waitForTimeout(100);
  ok('탭 줄의 🔍 버튼으로도 열림 (탭은 바뀌지 않음)', await p.evaluate(() => !document.getElementById('finder').classList.contains('hide') && !document.getElementById('t-log').classList.contains('hide')));
  await p.keyboard.press('Escape');
  // 레이더
  await p.evaluate(() => showTab('next')); await p.waitForTimeout(400);
  const rb = await p.evaluate(() => document.getElementById('radarBox').textContent);
  ok('다음 할 일 탭에 떡밥 레이더: 이름·이유·근거 두 줄', /떡밥 레이더/.test(rb) && /등대지기 한씨/.test(rb) && /7세션째/.test(rb), rb.slice(0, 200));
  ok('근거 줄 두 개, 마스터에게 해당 없음·나중에 버튼, 숨긴 목록', await p.evaluate(() => document.querySelectorAll('#radarBox .rde').length === 2 && [...document.querySelectorAll('#radarBox button')].some(x => x.textContent === '해당 없음') && [...document.querySelectorAll('#radarBox button')].some(x => x.textContent === '나중에') && /숨긴 떡밥 1개/.test(document.getElementById('radarBox').textContent)));
  await p.evaluate(() => { const o = api; window.api = api = (a, q) => { if (a === 'evidence') window.__ev = q; return o(a, q); }; document.querySelectorAll('#radarBox .rde')[1].click(); }); await p.waitForTimeout(250);
  const evq = await p.evaluate(() => window.__ev || null);
  ok('근거 줄을 누르면 그 세션의 앞뒤 대화를 보여 줌', S.evid.length === 1 && evq && evq.uids === 'cp3_61' && evq.session === '3' && await p.evaluate(() => !!document.querySelector('#modalBody .evl.on')), JSON.stringify(evq));
  await p.evaluate(() => closeModal());
  await p.evaluate(() => [...document.querySelectorAll('#radarBox button')].find(x => x.textContent === '해당 없음').click()); await p.waitForTimeout(250);
  ok('해당 없음 → 마스터 요청으로 보냄', S.off.length === 1 && S.off[0].key === 'npc:np1' && S.off[0].st === 'off' && S.off[0].kt === 'KT1', JSON.stringify(S.off));
  ok('페이지 오류 없음', !errs.length, errs.join(' | '));
  await b.close();
  // 플레이어 화면: 버튼 없음
  const b2 = await chromium.launch();
  const o2 = await open(b2, { handle });
  await o2.p.waitForTimeout(1500); await o2.p.evaluate(() => showTab('next')); await o2.p.waitForTimeout(400);
  ok('플레이어에게는 레이더만 보이고 버튼·숨긴 목록은 없음', await o2.p.evaluate(() => /등대지기 한씨/.test(document.getElementById('radarBox').textContent) && !document.querySelectorAll('#radarBox button').length && !/숨긴 떡밥/.test(document.getElementById('radarBox').textContent)));
  await b2.close();
  done();
})();
