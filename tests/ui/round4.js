// 4차 검토: 추천의 최신 상태(세션 전환, 그 뒤 새 기록, 최신이 아닌 답, 읽은 범위)와 키퍼 "지금 장면"(추정과 언급 구별, 고정과 회차, 딱지, 늦은 답)
const { chromium } = require('playwright'); const { open, ok, done, U, V, baseData } = require('./harness.js');
const wait = (p, ms) => p.waitForTimeout(ms);
const T = i => '2026-11-21 13:' + String(Math.floor(i / 6)).padStart(2, '0') + ':' + String(i % 6) + '0';
const only = process.argv[2] || '';
const part = async (tag, fn) => { if (only && !only.split(',').includes(tag)) return; try { await fn(); } catch (e) { ok('[' + tag + '] 시험이 끝까지 돎', false, String(e && e.message || e).slice(0, 300)); } };
const kb = { truth: '집사가 편지를 숨겼다', memo: '', glossary: '', done: [], deleted: {},
  npcs: [{ id: 'n1', seq: 1, name: '집사 윌리엄', role: '집사', secret: '주인의 편지를 숨겼다', lies: '서재에 간 적 없다', knows: '주인이 밤마다 서재에 갔다', attitude: '공손', voice: '낮게', motive: '가문 보호' }],
  places: [{ id: 'p1', seq: 1, name: '서재', hidden: '벽난로 뒤 비밀 공간' }, { id: 'p2', seq: 2, name: '지하실', hidden: '' }, { id: 'p3', seq: 3, name: '정원', hidden: '' }],
  clues: [{ id: 'c1', seq: 1, text: '벽난로 뒤 편지', where: '서재', core: true }, { id: 'c2', seq: 2, text: '찢어진 일기', where: '서재', core: false, mark: 'found' }, { id: 'c3', seq: 3, text: '녹슨 열쇠', where: '지하실', core: true }, { id: 'c4', seq: 4, text: '정원의 발자국', where: '정원', core: true, mark: 'found' }],
  rolls: [{ id: 'r1', seq: 1, where: '서재', skill: '관찰력', success: '벽돌 하나가 헐겁다', fail: '그을음뿐이다' }, { id: 'r2', seq: 2, where: '지하실', skill: '듣기', success: '물 떨어지는 소리' }], scenes: [] };
(async () => {
  const b = await chromium.launch();
  // 가짜 서버 상태
  const mk = () => {
    const S = { sess: '1', sumVer: '1', lines: [], next: null, nextCalls: [], boardSess: '1', rollDelay: {}, kBoardBody: null };
    const say = (name, text) => { const id = S.lines.length + 1; S.lines.push({ id, time: T(id), session: S.sess, name, text }); return id; };
    const v = () => Object.assign({}, V, { session: S.sess, sumVer: S.sumVer, total: S.lines.length });
    const handle = async (a, j) => {
      if (a === 'data') return Object.assign(baseData(), { v: v(), keeperName: '키퍼', story: '탐사자들이 저택에 도착했다.', summaries: [{ id: 2, session: '1', from: T(1), to: T(4), text: '【현관】\n- 집사가 일행을 맞이함 (#3)' }],
        notes: { places: [{ id: 'a', name: '서재', aka: '도서실' }, { id: 'b', name: '지하실', aka: '' }], npcs: [], pcs: [], handouts: [], clues: [{ id: 'k1', text: '일기 뒷장이 없다', status: '미해결', kind: '확인' }] } });
      if (a === 'poll') { const since = Number(j.since || 0); return { ok: true, v: v(), lines: S.lines.filter(l => l.id > since), presence: [], from: since, jumped: false }; }
      if (a === 'nextSteps') { S.nextCalls.push(!!j.force); return typeof S.next === 'function' ? S.next(j) : S.next; }
      if (a === 'kData') return { ok: true, kb, sources: [], pending: 0, chunks: 0, board: { at: '2026-11-21 13:05:00', session: S.boardSess, result: { clues: [{ id: 'c1', status: 'unfound', note: '' }], wrong: [], lies: [], hints: ['집사가 벽난로 쪽을 힐끔 본다'], next: '서재를 더 살피게 유도', basis: { processedId: 4, total: 6, session: S.boardSess, scene: '서재' }, sent: { truth: false, clues: 4, npcs: 1 } } },
        recaps: [], awardsLogs: [], feedbacks: [], npcLog: [], rollLog: [], recap: null, awards: null, rollsTotal: 0, sessions: [{ session: '1', count: 6 }], session: S.sess, keeperName: '키퍼', resetVer: '1', kbGen: '0', weak: false, code: '2026-11-21.25' };
      if (a === 'kRoll') { const d = S.rollDelay[j.skill] || 0; if (d) await new Promise(r => setTimeout(r, d)); return { ok: true, written: [{ id: 'x', where: j.place, skill: j.skill, success: j.skill + ' 성공 결과' }], excerpts: [], otherPlace: false, level: j.level }; }
      if (a === 'kBoard') { S.kBoardBody = j; return { ok: true, board: {} }; }
      return null;
    };
    return { S, say, handle };
  };
  const rec = (S, sess, over) => Object.assign({ key: '1.1.' + sess + '.1', sess, rv: '1', t: Date.now(), at: '2026-11-21 13:01:00', basis: { processedId: 4, total: S.lines.length, rawFrom: 5, rawTo: S.lines.length, rawN: S.lines.length - 4, rawCut: 0, rawSkip: 0, lastTime: T(S.lines.length), sums: 1, sumVer: S.sumVer, notesVer: '1' },
    now: { scene: '저택 서재', just: '세션 ' + sess + '에서 일기를 찾았다', agreed: '집사에게 묻기로 함', held: '' }, items: [{ kind: '인물', title: '세션 ' + sess + ' 추천: 집사에게 묻는다', why: '', prio: 1, src: [], guess: false }] }, over || {});
  const nextUi = p => p.evaluate(() => ({ cards: [...document.querySelectorAll('#nextBox .nxi b')].map(x => x.textContent), st: document.getElementById('nextSt').textContent, fresh: document.getElementById('nextFresh').textContent, freshCls: document.getElementById('nextFresh').className, now: document.getElementById('nextNow').textContent, has: !!nextSt.data }));

  await part('next', async () => {
    const { S, say, handle } = mk(); for (let i = 0; i < 6; i++) say(['키퍼', '철수', '영희'][i % 3], '세션 1 이야기 ' + i);
    S.next = () => ({ ok: true, next: rec(S, '1'), fresh: true, behind: 0 });
    const { p, calls, errs } = await open(b, { handle }); await wait(p, 2500);
    await p.evaluate(() => showTab('next')); await wait(p, 1200);
    let u = await nextUi(p);
    ok('두 구역으로 나뉨: ① 지금 상황(AI 없이) / ② AI 추천', /① 지금 상황/.test(u.now) && /② AI 추천/.test(u.fresh) && u.cards.length === 1);
    ok('새 기록이 없을 때는 "그 뒤 새 기록 없음"', /그 뒤 새 기록 없음/.test(u.fresh) && !/ old| some/.test(u.freshCls), u.fresh);
    ok('"지금 상황"에 요약 뒤 새 말 수를 AI 없이 적음', /그 뒤 새 말 2줄/.test(u.now), u.now.slice(0, 90));
    // 새 말 1줄 → 탭을 열어 둔 채로, AI를 부르지 않고 표시만 바뀜
    const nCalls = S.nextCalls.length; say('철수', '새로 한 말 하나'); await wait(p, 6000);
    u = await nextUi(p);
    ok('새 말이 1줄만 와도 "그 뒤 새 기록 1줄"로 바뀜 (탭을 연 채, AI 호출 없이)', /그 뒤 새 기록 1줄/.test(u.fresh) && / some/.test(u.freshCls) && S.nextCalls.length === nCalls && /그 뒤 새 말 3줄/.test(u.now), u.fresh + ' · 호출 ' + (S.nextCalls.length - nCalls));
    ok('읽은 곳과 지금 가장 새 말을 따로 적음', /읽은 곳: 13:0\d #6까지/.test(u.fresh) && /지금 가장 새 말: 13:0\d #7/.test(u.fresh), u.fresh);
    // 요약·북마크가 바뀜 (sumVer) → AI를 부르지 않고 "바뀌었어요"만
    S.sumVer = '2'; await wait(p, 6000); u = await nextUi(p);
    ok('추천 뒤 요약·북마크가 바뀌면 알리고(자동으로 AI를 부르지는 않음) 다시 추천 버튼', /요약·정리·북마크가 바뀌었어요/.test(u.fresh) && / old/.test(u.freshCls) && S.nextCalls.length === nCalls && /지금 다시 추천/.test(u.fresh), u.fresh);
    // 서버가 "최신이 아님"이라고 답한 경우
    S.next = () => ({ ok: true, next: rec(S, '1', { basis: Object.assign(rec(S, '1').basis, { rawCut: 2, rawSkip: 28 }) }), fresh: false, moved: true, behind: 0 });
    await p.click('#nextGo'); await wait(p, 1000); u = await nextUi(p);
    ok('만드는 사이 요약이 바뀐 답(fresh:false, moved)은 최신이라고 하지 않음', /만드는 사이 요약·정리가 바뀌어서/.test(u.st) && /요약·정리·북마크가 바뀌었어요/.test(u.fresh), u.st);
    ok('줄여 읽은 긴 말과 읽지 못한 줄 수를 그대로 적음 (다 읽었다고 하지 않음)', /긴 말 2개는 앞뒤만 읽음/.test(u.st) && /28줄은 요약도 안 됐고 이번에 읽지도 못함/.test(u.st), u.st);
    S.next = () => ({ ok: true, next: rec(S, '1', { basis: Object.assign(rec(S, '1').basis, { total: S.lines.length - 1 }) }), fresh: false, wait: true, behind: 1 });
    await p.click('#nextGo'); await wait(p, 1000); u = await nextUi(p);
    ok('1분 안이라 받아 둔 추천을 돌려받았고 새 말이 있으면 그렇게 말함', /1분 안에 만든 추천이라 새로 만들지 않았어요 \(그 뒤 새 기록은 반영되지 않음/.test(u.st) && /그 뒤 새 기록 1줄/.test(u.fresh), u.st);
    // 세션 2로 넘어감 → 탭을 연 채로 지난 추천이 걷힘
    S.next = () => ({ ok: true, next: rec(S, '1'), fresh: true, behind: 0 }); await p.click('#nextGo'); await wait(p, 800);
    S.sess = '2'; await wait(p, 6000); u = await nextUi(p);
    ok('세션이 넘어가면 받아 둔 지난 세션 추천을 바로 걷음 (nextSt에 남기지 않음)', !u.has && u.cards.length === 0 && /지난 추천을 걷었어요/.test(u.st) && !/② AI 추천/.test(u.fresh), u.st);
    // 예전 서버(.24)의 답: 세션 전환 직후 1분 안에 force → 세션 1 추천을 fresh:false, wait:true로 돌려줌
    S.next = () => ({ ok: true, next: rec(S, '1', { sess: undefined, rv: undefined }), fresh: false, wait: true, behind: 0 });
    await p.click('#nextGo'); await wait(p, 1000); u = await nextUi(p);
    ok('서버가 지난 세션 추천을 돌려줘도(예전 서버) 지금 추천으로 보이지 않음', !u.has && u.cards.length === 0 && /지난 세션의 추천만 있어서 보이지 않아요/.test(u.st), u.st);
    // 늦게 온 답: 요청한 뒤 세션이 넘어감
    S.next = async () => { await new Promise(r => setTimeout(r, 5500)); return { ok: true, next: rec(S, '2'), fresh: true, behind: 0 }; };
    await p.click('#nextGo'); await wait(p, 300); S.sess = '3'; await wait(p, 9000); u = await nextUi(p);
    ok('추천을 받는 사이 세션이 넘어가면 늦게 온 답을 쓰지 않음', !u.has && u.cards.length === 0 && /세션이 넘어갔어요/.test(u.st), u.st);
    S.next = () => ({ ok: true, next: rec(S, '3'), fresh: true, behind: 0 }); await p.click('#nextGo'); await wait(p, 1000); u = await nextUi(p);
    ok('지금 세션의 추천은 정상으로 보임', u.has && /세션 3 추천/.test(u.cards[0] || ''));
    // 세션 측정 상자
    await p.evaluate(() => { showTab('set'); document.getElementById('statBox').open = true; statShow(); }); await wait(p, 200);
    const stx = await p.evaluate(() => document.getElementById('statTxt').textContent);
    ok('세션 측정: 다음 할 일을 연 횟수와 뜨는 시간을 이 기기에서 셈 (서버 요청 없음)', /\[다음 할 일\] 연 횟수 [1-9]/.test(stx) && /바로 보이는 부분이 화면에 뜨기까지 중간 0\.\d초/.test(stx) && /\[받아쓰기\]/.test(stx) && !calls.some(c => /stat/i.test(c.a)), stx.split("\n").find(l => /다음 할 일/.test(l)));
    ok('화면 오류 없음 (다음 할 일)', !errs.length, errs.join(' | '));
    await p.context().close();
  });

  await part('scene', async () => {
    const { S, say, handle } = mk();
    say('키퍼', '여러분은 저택 현관에 서 있습니다'); say('철수', '집사에게 인사한다'); say('키퍼', '집사 윌리엄이 고개를 숙입니다'); say('영희', '안으로 들어가자');
    say('키퍼', '일행은 서재에 도착했습니다. 책장이 벽을 가득 채우고 있습니다'); say('철수', '책장을 살펴본다');
    S.next = () => ({ ok: true, next: rec(S, '1'), fresh: true, behind: 0 });
    const { p, calls, errs } = await open(b, { handle, session: { t_kt: 'KT1' } }); await wait(p, 2500);
    await p.evaluate(() => showTab('next')); await wait(p, 800);           // 공개 추천을 받아 둔다
    await p.evaluate(() => showTab('keeper')); await wait(p, 1200);
    const ui = () => p.evaluate(() => ({ place: document.getElementById('kNowPlace').value, who: document.getElementById('kNowWho').textContent, hint: document.getElementById('kNowHint').textContent, txt: document.getElementById('kview').textContent, pin: K.scene.pin,
      pub: (document.getElementById('kNowPub') || {}).textContent || '', board: (document.getElementById('kNowBoard') || {}).textContent || '', count: document.getElementById('kNowCount').textContent, old: (document.getElementById('kNowOld') || {}).textContent || '' }));
    let u = await ui();
    ok('"서재에 도착했습니다" → 서재로 추정하고 [자동 추정]이라고 적음', u.place === '서재' && u.who === '자동 추정' && /추정 근거: #5에서 옮겨 간 것으로 보임/.test(u.hint), u.who + ' / ' + u.hint);
    // 지나간 일로 다른 장소가 나옴 → 장면을 바꾸지 않는다
    say('철수', '아까 지하실에서 찾은 편지를 다시 읽어 본다'); say('영희', '지하실 얘기는 나중에 하자'); await wait(p, 6000); await p.evaluate(() => kRender()); u = await ui();
    ok('"아까 지하실에서 찾은 편지"는 지금 장면으로 치지 않음', u.place === '서재' && !/지하실/.test(u.hint), u.place + ' / ' + u.hint);
    // 이름만 나옴(언급) → 화면은 그대로, 한 줄 안내
    say('영희', '정원 쪽 창문이 열려 있네'); say('철수', '정원에 누가 있는지 본다'); await wait(p, 6000); await p.evaluate(() => kRender()); u = await ui();
    ok('이름만 나온 장소(정원)는 화면을 바꾸지 않고 한 줄로만 알림 (추정이라고 적음)', u.place === '서재' && /"정원"이\(가\) 나왔어요 \(추정:/.test(u.hint), u.hint);
    // 옮겨 갔다는 말 → 자동 추정일 때는 바꾼다
    say('키퍼', '일행은 지하실로 내려갑니다. 공기가 차갑습니다'); await wait(p, 6000); await p.evaluate(() => kRender()); u = await ui();
    ok('"지하실로 내려갑니다" → 지하실로 바꿈 (자동 추정)', u.place === '지하실' && u.who === '자동 추정', u.place + ' / ' + u.who);
    ok('단서 수를 둘로 나눠 적음: 이 장면 / 시나리오 전체 핵심', /이 장면의 단서 0\/1 찾음 · 시나리오 전체 핵심 단서 1\/3 찾음/.test(u.count) && /마스터 표시\(✎\)가 먼저/.test(u.count), u.count);
    // 마스터가 고름·고정 → 추정보다 먼저
    await p.evaluate(() => { const i = document.getElementById('kNowPlace'); i.value = '서재'; i.onchange(); }); await wait(p, 200); u = await ui();
    ok('마스터가 고르면 [마스터가 고정], 추정(지하실)이 달라도 그대로', u.place === '서재' && u.who === '마스터가 고정' && /지하실/.test(u.hint), u.who + ' / ' + u.hint);
    ok('NPC 칸 이름: "NPC가 알고 있는 정보" (말해도 된다고 단정하지 않음)', /NPC가 알고 있는 정보/.test(u.txt) && !/말해도 되는 것/.test(u.txt) && /지금 말해도 되는지는 정리본에 없어요/.test(u.txt));
    ok('공개 추천에서 온 내용은 [AI 해석]으로 적고 "세션 기록"이라고 하지 않음', /^AI 해석 13:01/.test(u.pub) && /대화 원문이 아니에요/.test(u.pub) && !/세션 기록/.test(u.pub) && /그 뒤 새 말 \d+줄/.test(u.pub), u.pub.slice(0, 80));
    ok('현황판 힌트에 판단 때의 장면·시각·기록 범위를 적음', /^AI 판단 13:05/.test(u.board) && /판단할 때: 장면 "서재" · 기록 #6까지 · 그 뒤 새 말 \d+줄/.test(u.board) && /힐끔 본다/.test(u.board), u.board.slice(0, 90));
    await p.evaluate(() => { const i = document.getElementById('kNowPlace'); i.value = '지하실'; i.onchange(); }); await wait(p, 200); u = await ui();
    ok('지금 장면이 판단 때 장면과 다르면 그렇게 알림', /지금 장면\(지하실\)이 아니라 "서재"에 있을 때의 판단/.test(u.board), u.board.slice(0, 120));
    // 현황 갱신 요청에 지금 장면을 함께 보냄
    await p.evaluate(() => { K.view = 'board'; kRender(); }); await wait(p, 200);
    await p.evaluate(() => [...document.querySelectorAll('#kview button')].find(x => /현황 갱신/.test(x.textContent)).click()); await wait(p, 1200);
    ok('현황 갱신 요청에 지금 장면을 함께 보냄 (판단 때 장면을 남기려고)', S.kBoardBody && S.kBoardBody.scene === '지하실', JSON.stringify(S.kBoardBody));
    // 늦게 온 판정 답이 나중에 고른 판정을 덮어쓰지 않음
    S.rollDelay = { '관찰력': 2500 };
    await p.evaluate(() => { kRollQuick('관찰력', '서재'); }); await wait(p, 200); await p.evaluate(() => { kRollQuick('듣기', '지하실'); }); await wait(p, 4000);
    const rr = await p.evaluate(() => ({ skill: K.rollR && K.rollR.skill, f: K.rollF.skill, txt: document.getElementById('kview').textContent }));
    ok('늦게 온 판정 답(관찰력)이 나중에 고른 판정(듣기)을 덮어쓰지 않음', rr.skill === '듣기' && rr.f === '듣기' && /듣기 성공 결과/.test(rr.txt) && !/관찰력 성공 결과/.test(rr.txt), rr.skill);
    // 회차가 넘어감 → 고정을 풀고 알림, 지난 회차 추천·현황판 힌트를 섞지 않음
    await p.evaluate(() => { K.view = 'now'; kRender(); }); await wait(p, 200);
    S.sess = '2'; await wait(p, 14000); u = await ui();
    ok('회차가 넘어가면 지난 회차의 고정을 풀고 알림 (한 번 눌러 다시 고정)', !u.pin && u.place !== '지하실' && /세션 1에서 고정한 장면 "지하실"은 풀었어요/.test(u.old) && /"지하실" 다시 고정/.test(u.old), u.place + ' / ' + u.old);
    ok('지난 회차의 공개 추천은 지금 장면에 보이지 않음', !u.pub, u.pub.slice(0, 40));
    await p.evaluate(() => [...document.querySelectorAll('#kNowOld button')][0].click()); await wait(p, 200); u = await ui();
    ok('[다시 고정]을 누르면 그 장면으로 고정', u.pin && u.place === '지하실' && u.who === '마스터가 고정' && !u.old);
    ok('지난 회차 현황판의 힌트는 섞지 않고 그렇다고 적음', /^AI 판단 세션 1 13:05/.test(u.board) && /지난 회차\(세션 1\)의 현황판이라 그때의 힌트는 여기에 섞지 않았어요/.test(u.board) && !/힐끔 본다/.test(u.board) && /지난 회차 것/.test(u.count), '[' + u.board.slice(0, 160) + '] [' + u.count + ']');
    const ai = calls.filter(c => ['kNpc'].includes(c.a) || (c.a === 'kRoll' && c.body.ai));
    ok('지금 장면을 보는 동안 AI 호출은 직접 누른 현황 갱신 1번뿐', ai.length === 0 && calls.filter(c => c.a === 'kBoard').length === 1);
    ok('화면 오류 없음 (지금 장면)', !errs.length, errs.join(' | '));
    await p.context().close();
  });
  await b.close(); done();
})();
