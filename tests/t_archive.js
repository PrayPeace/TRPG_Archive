// 📚 서고로 보내기: 연결 코드 확인, 세션 기록을 만들면 서고로 감, 열쇠는 응답에 안 실림, 서고 주인은 PL에서 빠지고 대장PC로
const { makeStore, room, exec, run, post, ok, done } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const URL = 'https://script.google.com/macros/s/AKfyTESTseogo123/exec', KEY = 'k'.repeat(32);
const st = makeStore(); room(st, A, 'pwA');
st.fetches = []; st.seogo = (b) => b.key === KEY ? { ok: true, row: 7, added: true } : { ok: false, error: 'key' };
const ex = () => { const c = exec(st, A); c.UrlFetchApp = { fetch: (u, o) => { if (/anthropic/.test(u)) return { getResponseCode: () => 200, getContentText: () => '{}' }; const b = JSON.parse(o.payload); st.fetches.push({ u, b }); const r = st.seogo(b); if (r === 'throw') throw new Error('연결 끊김'); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(r) }; } }; return c; };
run(ex(), "setConf('keeperName','달토끼')");
const base = Date.parse('2026-11-21T04:00:00Z');
post(ex(), { action: 'lines', pw: 'pwA', items: [1, 2].map(i => ({ uid: 'L' + i, name: i === 1 ? '소금빵' : '프레이피스', session: '1', t: new Date(base + i * 60000).toISOString(), text: '그 등대 불 꺼진 거 우리 탓 아니죠 ' + i })) });
run(ex(), "withLock(20000, () => { sheet(SH.SUM).appendRow(['1','2026-11-21 13:00:00','2026-11-21 13:30:00', enc('【등대】\\n- 노인이 맞이함'),'','']); bump('sumVer'); })");
run(ex(), "sheet(SH.CHAR).appendRow([enc('토머스'), enc('프레이피스'), enc(JSON.stringify({ name: '토머스' }))]); sheet(SH.CHAR).appendRow([enc('엘리'), enc('소금빵'), enc(JSON.stringify({ name: '엘리' }))])");
const OUT = { title: 'CoC 안개 낀 등대', pcs: ['토머스(프레이피스): 의사.'], setting: '', glance: { one: '등대를 조사함', ending: '진행 중.', mine: '', keys: '[일지]' },
  body: '등대지기 실종 소식을 듣고 섬으로 건너옴.\n-[선착장]-\n-노인이 맞이함.', ending: '생환. 등대 불을 다시 켬.', epilogue: ['노인이 편지를 보냄.'],
  memo: { quotes: [{ who: '소금빵', text: '그 등대 불 꺼진 거 우리 탓 아니죠 1' }, { who: '소금빵', text: '지어낸 말' }] } };
st.aiReply = (sys) => /세션 기록/.test(sys) ? JSON.stringify(OUT) : '';

// 연결 전에는 아무것도 안 보냄
let r = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '소금빵' });
ok('연결 전: 세션 기록만 만들고 서고로는 안 보냄', r.ok && !r.archive && st.fetches.length === 0);
// 연결: 모양이 틀리면 거절, 서고가 모르는 열쇠면 거절, 맞으면 저장
ok('연결 코드 모양이 틀리면 거절', !run(ex(), `kArchiveSet('https://evil.example/exec#${KEY}', '프레이피스')`).ok && st.fetches.length === 0);
ok('서고가 모르는 열쇠면 거절 (저장 안 함)', !run(ex(), `kArchiveSet('${URL}#${'x'.repeat(32)}', '프레이피스')`).ok && !run(ex(), 'archiveLinked()'));
const s1 = run(ex(), `kArchiveSet('${URL}#${KEY}', '프레이피스')`);
ok('맞는 코드면 서고에 확인(trpg_ping) 뒤 연결', s1.ok && st.fetches.slice(-1)[0].b.op === 'trpg_ping' && run(ex(), 'archiveLinked()'));
const st0 = run(ex(), 'kArchive()');
ok('연결 상태 보기에는 열쇠가 없음', st0.linked && st0.me === '프레이피스' && !JSON.stringify(st0).includes(KEY), JSON.stringify(st0));
// 친구가 세션 기록을 만들어도 서고로 감: 서고 주인 기준으로 PL·대장PC
st.fetches.length = 0;
r = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '소금빵' });
const sent = (st.fetches[0] || {}).b || {};
ok('세션 기록(다시 쓴 것)도 서고로 보냄, 응답에는 열쇠 없음', r.ok && r.reused && r.archive && r.archive.ok && st.fetches.length === 1 && !JSON.stringify(r).includes(KEY), JSON.stringify(r.archive));
ok('보낸 내용: 방 식별·세션·제목·KP·PL(서고 주인 뺌)·대장PC·결말·후일담·한 줄', sent.op === 'trpg_in' && sent.key === KEY && /^r[a-z0-9]{8}#1$/.test(sent.id) && sent.title === 'CoC 안개 낀 등대' && sent.kp === '달토끼' && sent.pl.join() === '소금빵' && sent.myPc === '토머스' && sent.ending === '생환. 등대 불을 다시 켬.' && sent.epilogue[0] === '노인이 편지를 보냄.' && sent.one === '등대를 조사함', JSON.stringify(sent).slice(0, 400));
ok('명대사는 서버가 확인한 것만 보냄 (지어낸 말은 빠짐)', sent.quotes.length === 1 && sent.quotes[0].who === '소금빵');
st.fetches.length = 0;
post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '소금빵' });
ok('같은 기록을 이미 보냈으면 다시 안 보냄', st.fetches.length === 0);
// 서고가 꺼져 있어도 세션 기록은 그대로 받음, 마스터 단추로 다시 보내기
st.seogo = () => 'throw';
st.aiReply = (sys) => /세션 기록/.test(sys) ? JSON.stringify(Object.assign({}, OUT, { ending: '생환. 노인과 작별함.' })) : '';
r = post(ex(), { action: 'myRecord', pw: 'pwA', session: '1', me: '소금빵', force: true });
ok('서고에 못 닿아도 세션 기록은 돌려주고, 못 보냈다고 적어 둠', r.ok && r.archive && !r.archive.ok && run(ex(), "confJson('archiveSent', {})['1'].ok") === false, JSON.stringify(r).slice(0, 200) + JSON.stringify(run(ex(), "confJson('archiveSent', {})")));
st.seogo = (b) => b.key === KEY ? { ok: true, row: 7 } : { ok: false, error: 'key' };
st.fetches.length = 0;
const k = run(ex(), "kArchiveSend('1')");
ok('마스터의 "이 세션 서고로 보내기": 서고 주인 기준 기록을 만들어 보냄', k.ok && st.fetches.length === 1 && st.fetches[0].b.op === 'trpg_in', JSON.stringify(k));
const calls = st.aiCalls; st.fetches.length = 0;
const k2 = run(ex(), "kArchiveSend('1')");
ok('한 번 더 누르면 저장된 기록을 다시 보냄 (AI 다시 안 부름)', k2.ok && k2.reused && st.aiCalls === calls && st.fetches.length === 1, JSON.stringify(k2));
ok('요약 없는 세션은 보내지 않고 알려 줌', run(ex(), "kArchiveSend('9')").empty === true);
// 마스터가 서고 주인이면 KP는 '나', 대장PC는 비움
run(ex(), "setConf('keeperName','프레이피스')"); st.fetches.length = 0;
run(ex(), "kArchiveSend('1')");
const s2 = (st.fetches[0] || {}).b || {};
ok('서고 주인이 마스터면 KP "나", PL에서 빼고, 대장PC는 빈칸', s2.kp === '나' && s2.myPc === '' && s2.pl.join() === '소금빵', JSON.stringify({ kp: s2.kp, pl: s2.pl, pc: s2.myPc }));
// 서고 주인이 없는 세션: 자동으로는 안 보내고, 마스터 단추로는 보냄
run(ex(), "setConf('keeperName','달토끼')");
post(ex(), { action: 'lines', pw: 'pwA', items: [{ uid: 'S2', name: '소금빵', session: '2', t: new Date(base + 9e6).toISOString(), text: '오늘은 대장 없이 해요' }] });
run(ex(), "withLock(20000, () => { sheet(SH.SUM).appendRow(['2','2026-11-21 16:00:00','2026-11-21 16:30:00', enc('【항구】\\n- 배를 탐'),'','']); bump('sumVer'); })");
st.fetches.length = 0;
r = post(ex(), { action: 'myRecord', pw: 'pwA', session: '2', me: '소금빵' });
ok('서고 주인이 말 한 마디 없는 세션은 자동으로 안 보냄 (기록은 그대로)', r.ok && r.archive && r.archive.skipped && st.fetches.length === 0, JSON.stringify(r.archive));
const k3 = run(ex(), "kArchiveSend('2')");
ok('그래도 마스터 단추로는 보낼 수 있음', k3.ok && st.fetches.length === 1 && st.fetches[0].b.id.endsWith('#2'), JSON.stringify(k3));
// 방 전체 보내기(auto): 이미 보낸 그대로면 건너뜀, 서고 주인 없는 세션은 뺌
st.fetches.length = 0;
const a1 = run(ex(), "kArchiveSend('1', true)"), a2 = run(ex(), "kArchiveSend('2', true)"), a9 = run(ex(), "kArchiveSend('9', true)");
const a0 = run(ex(), "kArchiveSend('1', true)"); ok('방 전체: 바뀐 세션은 보내고, 한 번 더 누르면 "이미 보냄", 주인 없는 세션은 뺌, 요약 없는 세션은 빈 것', a1.ok && !a1.already && a0.ok && a0.already && a2.ok && a2.skipped && a9.empty && st.fetches.length === 1, JSON.stringify([a0, a1, a2, a9, st.fetches.length]));
// 로비에서 새 방을 만들면 서고 연결도 물려받음
const nr = run(ex(), "newRoom('새 방', 'coc', 'pw1234')");
const nid = Object.keys(st.books).find(k => k !== A && /^1COPY/.test(k));
const nc = exec(st, nid);
ok('새로 만든 방도 서고에 연결돼 있음 (주인 이름 그대로)', nr.ok && nid && run(nc, 'archiveLinked()') && run(nc, "getConf('archiveMe')") === '프레이피스' && run(nc, "getConf('archiveKey')") === KEY, JSON.stringify(nr).slice(0, 200));
ok('연결 끊기', run(ex(), "kArchiveSet('', '')").ok && !run(ex(), 'archiveLinked()'));
done();
