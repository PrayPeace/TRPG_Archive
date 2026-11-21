// 세션 중 곁눈질 화면: 플레이어 "다음 할 일"(AI 없이 보이는 지금 상황, 지금 할 일 1~3개, 오래된 추천 표시, 근거)과 키퍼 "지금 장면"(AI 호출 0번, 고정)
const { chromium } = require('playwright'); const { open, ok, done, U, V, baseData } = require('./harness.js');
const wait = (p, ms) => p.waitForTimeout(ms);
const T = i => '2026-11-21 13:' + String(Math.floor(i / 6)).padStart(2, '0') + ':' + String(i % 6) + '0';
const mkLines = (from, to, f) => Array.from({ length: to - from + 1 }, (_, k) => ({ id: from + k, time: T(from + k), session: '1', name: ['키퍼', '철수', '영희'][(from + k) % 3], text: f(from + k) }));
const data = () => Object.assign(baseData(), { v: Object.assign({}, V, { total: 60 }), story: '탐사자들이 저택에 도착했다.',
  summaries: [{ id: 2, session: '1', from: T(1), to: T(15), text: '【현관】\n- 집사가 일행을 맞이함 (#3)' }, { id: 3, session: '1', from: T(16), to: T(30), text: '【서재】\n- 책장에서 찢어진 일기를 찾음 (#20)\n- 집사는 서재에 간 적 없다고 주장함 (#25)' }],
  notes: { places: [{ id: 'a', name: '서재', aka: '도서실', desc: '', found: '' }, { id: 'b', name: '지하실', aka: '', desc: '', found: '' }], npcs: [{ id: 'n', name: '집사 윌리엄' }], pcs: [], handouts: [],
    clues: [{ id: 'k1', text: '찢어진 일기의 뒷장이 없다', status: '미해결', kind: '확인' }, { id: 'k2', text: '집사는 서재에 간 적 없다고 주장함', status: '미해결', kind: '주장' }, { id: 'k3', text: '현관 열쇠', status: '해결', kind: '확인' }] },
  bookmarks: [{ sid: 3, text: '- 책장에서 찢어진 일기를 찾음 (#20)', by: '철수', at: T(21), session: '1' }] });
const next = { key: 'k', t: Date.now(), at: '2026-11-21 13:05:00', basis: { processedId: 30, total: 40, rawFrom: 31, rawN: 10, sums: 2 },
  now: { scene: '저택 서재', just: '찢어진 일기를 찾았다', agreed: '집사에게 일기에 대해 묻기로 함', held: '지하실은 나중에' },
  items: [{ kind: '인물', title: '집사에게 일기를 보여 준다', why: '방금 하기로 함', prio: 1, src: [33, 35], guess: false }, { kind: '단서', title: '일기 뒷장을 찾는다', why: '뒷장이 없음', prio: 1, src: [], guess: false },
    { kind: '장소', title: '지하실을 살핀다', why: '미뤄 둠', prio: 2, src: [], guess: false }, { kind: '행동', title: '벽난로를 조사한다', why: '그을음이 이상하다는 느낌', prio: 2, src: [], guess: true }, { kind: '준비', title: '손전등을 챙긴다', why: '', prio: 3, src: [], guess: false }, { kind: '장소', title: '정원', why: '', prio: 3, src: [], guess: false }] };
const kb = { truth: '집사가 편지를 숨겼다', memo: '', glossary: '', done: [], deleted: {},
  npcs: [{ id: 'n1', seq: 1, name: '집사 윌리엄', role: '집사', secret: '주인의 편지를 숨겼다', lies: '서재에 간 적 없다', knows: '주인이 밤마다 서재에 갔다', attitude: '공손하지만 경계', voice: '느리고 낮게', motive: '가문 보호' }, { id: 'n2', seq: 2, name: '정원사 톰', role: '정원사', secret: '밤에 불빛을 봤다' }],
  places: [{ id: 'p1', seq: 1, name: '서재', hidden: '벽난로 뒤 비밀 공간' }, { id: 'p2', seq: 2, name: '지하실', hidden: '' }],
  clues: [{ id: 'c1', seq: 1, text: '벽난로 뒤 편지', where: '서재', how: '관찰력 판정', core: true }, { id: 'c2', seq: 2, text: '찢어진 일기', where: '서재', how: '자료조사', core: true, mark: 'found' }, { id: 'c3', seq: 3, text: '녹슨 열쇠', where: '지하실', core: true }],
  rolls: [{ id: 'r1', seq: 1, where: '서재', skill: '관찰력', success: '벽난로 벽돌 하나가 헐겁다', fail: '그을음뿐이다', locked: true }, { id: 'r2', seq: 2, where: '지하실', skill: '듣기', success: '물 떨어지는 소리' }],
  scenes: [{ id: 's1', seq: 1, title: '서재 조사', summary: '서재에서 편지를 찾는다' }, { id: 's2', seq: 2, title: '지하실로', summary: '열쇠로 지하실 문을 연다' }] };
const kData = { ok: true, kb, sources: [], pending: 0, chunks: 0, board: { at: '2026-11-21 13:05:00', result: { clues: [{ id: 'c1', status: 'unfound', note: '' }, { id: 'c3', status: 'unfound', note: '' }], wrong: [], lies: [], hints: ['집사가 벽난로 쪽을 힐끔 본다'], next: '서재를 더 살피게 유도', basis: { processedId: 30, total: 40 }, sent: { truth: false, clues: 3, npcs: 2 } } },
  recaps: [], awardsLogs: [], feedbacks: [], npcLog: [], rollLog: [], recap: null, awards: null, rollsTotal: 0, sessions: [{ session: '1', count: 60 }], session: '1', keeperName: '대장', resetVer: '1', kbGen: '0', weak: false, code: '2026-11-21.24' };
(async () => {
  const b = await chromium.launch();
  for (const [tag, vp] of [['PC', { width: 1100, height: 800 }], ['좁은 창', { width: 380, height: 720 }]]) {
    let extra = [], nextDelay = 2500;
    const handle = (a, j) => {
      if (a === 'data') return data();
      if (a === 'poll') { const since = Number(j.since || 0); const all = mkLines(1, 60, i => (i === 55 ? '그럼 서재로 다시 가 보자' : i === 58 ? '도서실 책장을 본다' : '이야기 ' + i)).concat(extra); return { ok: true, v: Object.assign({}, V, { total: all.length }), lines: all.filter(l => l.id > since), presence: [], from: since, jumped: false }; }
      if (a === 'nextSteps') return { ok: true, next, fresh: true, behind: 0 };
      if (a === 'kData') return kData;
      if (a === 'kRoll') return { ok: true, written: [{ id: 'r1', where: '서재', skill: '관찰력', success: '벽난로 벽돌 하나가 헐겁다', fail: '그을음뿐이다', locked: true }], excerpts: [], otherPlace: false, level: j.level };
      if (a === 'evidence') return { ok: true, lines: [{ id: 33, time: T(33), name: '철수', text: '집사한테 일기 보여 주자', focus: true }], missing: [] };
      return null;
    };
    const { p, calls, errs } = await open(b, { viewport: vp, handle, session: { t_kt: 'KT1' } });
    await wait(p, 2500);
    // ── 플레이어: 다음 할 일 ──
    const t0 = Date.now(); await p.evaluate(() => showTab('next'));
    const inst = await p.evaluate(() => document.getElementById('nextNow').textContent); const ms = Date.now() - t0;
    ok('[' + tag + '] 지금 상황은 AI를 기다리지 않고 바로 보임', /마지막 장소\s*서재/.test(inst) && /풀리지 않은 단서 2개/.test(inst) && /북마크/.test(inst), ms + 'ms · ' + inst.slice(0, 70));
    await wait(p, 1500);
    const nx = await p.evaluate(() => ({ top: [...document.querySelectorAll('#nextBox > .nxi')].map(x => x.querySelector('b').textContent), more: document.querySelectorAll('#nextBox details .nxi').length, open: document.querySelector('#nextBox details').open,
      old: (document.querySelector('.nxold') || {}).textContent || '', now: (document.querySelector('.nxnow.ai') || {}).textContent || '', st: document.getElementById('nextSt').textContent, guess: !!document.querySelector('#nextBox details .nxg'), ev: document.querySelectorAll('#nextBox .ev').length, scrollW: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    ok('[' + tag + '] 지금 해 볼 만한 것 1~3개만 먼저, 나머지는 접어 둠', nx.top.length === 2 && nx.more === 4 && !nx.open, nx.top.join(' / '));
    ok('[' + tag + '] 추천 뒤로 말이 쌓였으면 오래된 추천이라고 알림', /20줄 더 쌓였/.test(nx.old), nx.old.slice(0, 40));
    ok('[' + tag + '] 추천이 읽은 기록 범위와 시각 표시', /13:05에 만든 추천/.test(nx.st) && /방금 한 말 10줄\(#31~#40\)/.test(nx.st), nx.st);
    ok('[' + tag + '] 지금 장면·하기로 한 일·미뤄 둔 일', /저택 서재/.test(nx.now) && /묻기로 함/.test(nx.now) && /지하실은 나중에/.test(nx.now));
    ok('[' + tag + '] 짐작은 "짐작" 딱지, 근거 발언 버튼', nx.guess && nx.ev === 1);
    await p.click('#nextBox .ev'); await wait(p, 500);
    ok('[' + tag + '] 근거를 누르면 그 발언 원문', /집사한테 일기 보여 주자/.test(await p.evaluate(() => document.getElementById('modalBody').textContent)));
    await p.evaluate(() => closeModal());
    ok('[' + tag + '] 가로로 넘치지 않음 (다음 할 일)', nx.scrollW);
    // ── 키퍼: 지금 장면 ──
    const before = calls.length; await p.evaluate(() => showTab('keeper')); await wait(p, 1200);
    const k1 = await p.evaluate(() => ({ view: K.view, place: document.getElementById('kNowPlace').value, txt: document.getElementById('kview').textContent, hint: document.getElementById('kNowHint').textContent }));
    ok('[' + tag + '] 키퍼 탭 첫 화면이 "지금 장면", 최근 대화로 장면 추정 (도서실=서재)', k1.view === 'now' && k1.place === '서재' && /자동 추정/.test(k1.hint), k1.place + ' · ' + k1.hint);
    ok('[' + tag + '] 이 장면의 단서: 찾음/아직, 핵심 수', /핵심 단서 1\/3 찾음/.test(k1.txt) && /벽난로 뒤 편지/.test(k1.txt) && /찢어진 일기/.test(k1.txt) && /다른 곳에 남은 핵심 단서[^]*녹슨 열쇠/.test(k1.txt));
    ok('[' + tag + '] 등장 NPC: 말투·목적·말해도 되는 것·숨길 것', /집사 윌리엄/.test(k1.txt) && /말투: 느리고 낮게/.test(k1.txt) && /주인이 밤마다 서재에 갔다/.test(k1.txt) && /주인의 편지를 숨겼다/.test(k1.txt) && !/정원사 톰/.test(k1.txt));
    ok('[' + tag + '] 판정 결과를 AI 없이 (마스터가 고친 것은 딱지)', /관찰력[^]*벽난로 벽돌 하나가 헐겁다[^]*그을음뿐이다/.test(k1.txt) && /마스터가 고침/.test(k1.txt) && !/물 떨어지는 소리/.test(k1.txt));
    ok('[' + tag + '] 숨은 정보·이어지는 장면·막혔을 때 힌트(AI 판단 시각)', /벽난로 뒤 비밀 공간/.test(k1.txt) && /이어지는 장면[^]*지하실로/.test(k1.txt) && /AI 판단 13:05/.test(k1.txt) && /힐끔 본다/.test(k1.txt));
    const ai = calls.slice(before).filter(c => ['kBoard', 'kNpc'].includes(c.a) || (c.a === 'kRoll' && c.body.ai));
    ok('[' + tag + '] 여기까지 AI 호출 0번', ai.length === 0, calls.slice(before).map(c => c.a).filter(a => a !== 'poll').join(','));
    // 장면 고정: 대화가 지하실로 가도 화면은 그대로, 한 줄로만 알림
    await p.click('#kNowPin'); await wait(p, 200);
    extra = mkLines(61, 64, i => '지하실로 내려가자 ' + i); await wait(p, 13000);
    const k2 = await p.evaluate(() => ({ place: document.getElementById('kNowPlace').value, hint: document.getElementById('kNowHint').textContent, pin: document.getElementById('kNowPin').textContent, y: document.documentElement.scrollTop }));
    ok('[' + tag + '] 고정하면 추정이 달라도 장면을 바꾸지 않고 한 줄로 알림', k2.place === '서재' && /지하실/.test(k2.hint) && /고정됨/.test(k2.pin), k2.hint);
    await p.evaluate(() => [...document.querySelectorAll('#kNowHint button')][0].click()); await wait(p, 300);
    const k3 = await p.evaluate(() => ({ place: document.getElementById('kNowPlace').value, txt: document.getElementById('kview').textContent }));
    ok('[' + tag + '] [이 장면 보기]로 바로 전환', k3.place === '지하실' && /녹슨 열쇠/.test(k3.txt) && /듣기/.test(k3.txt));
    // 판정 원문 확인: 한 번 눌러 AI 없이 찾기
    await p.evaluate(() => { kSceneSet('서재', true); kRender(); }); await wait(p, 200);
    await p.evaluate(() => [...document.querySelectorAll('#kview button')].find(x => /원문 확인/.test(x.textContent)).click()); await wait(p, 900);
    const rc = calls.filter(c => c.a === 'kRoll'); const k4 = await p.evaluate(() => ({ view: K.view, txt: document.getElementById('kview').textContent }));
    ok('[' + tag + '] 판정 [원문 확인] 한 번에 판정 보조로 (AI 호출 0번, 장소·기술 채워짐)', k4.view === 'roll' && rc.length === 1 && rc[0].body.ai === false && rc[0].body.place === '서재' && rc[0].body.skill === '관찰력' && /벽난로 벽돌/.test(k4.txt));
    ok('[' + tag + '] 가로로 넘치지 않음 (키퍼)', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    ok('[' + tag + '] 화면 오류 없음', !errs.length, errs.join(' | '));
    if (tag === 'PC') { await p.evaluate(() => { K.view = 'now'; kRender(); }); await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/keeper_now.png' : '/dev/null' }).catch(() => {}); }
    await p.context().close();
  }
  await b.close(); done();
})();
