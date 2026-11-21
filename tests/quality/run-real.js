/* 실제 Claude로 AI 품질을 재는 도구. 연습 방(테스트용 채널)에서만 돈다. 이 저장소의 자동 시험·GitHub 검사에서는 돌지 않는다 (요금이 들고 실제 방에 글을 쓰므로).
 * 사용 (PC에서):  ROOM_URL="https://script.google.com/macros/s/…/exec" ROOM_PW="방 비밀번호" KEEPER_PW="마스터 비밀번호" node tests/quality/run-real.js
 *   ① 방 이름에 "테스트"나 "연습"이 없으면 멈춘다 (운영 방에 가짜 대본이 들어가지 않게)
 *   ② 세션 1 대본을 넣고 요약 → 새 세션 → 세션 2 대본을 넣고 요약 → 다음 할 일(force) → 결과를 quality-out.json에 저장 → score.js로 채점
 *   ③ 마스터 자료 누출 항목은 먼저 연습 방의 "시나리오 자료"에 fixture.js의 keeperOnly 글을 올려 두었을 때만 뜻이 있다 (안 올렸으면 "확인 못 함")
 * Claude 호출: 요약 2~4번 + 정리 + 추천 1번 정도. 기존 연습 방 기록 뒤에 이어 붙는다 (지우지 않는다). */
const fs = require('fs'), path = require('path');
const { session1, session2, keeperOnly } = require('./fixture.js'), { score } = require('./score.js');
const URL_ = process.env.ROOM_URL, PW = process.env.ROOM_PW, KPW = process.env.KEEPER_PW;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = async body => (await fetch(URL_, { method: 'POST', body: JSON.stringify(Object.assign({ pw: PW }, body)), redirect: 'follow' })).json();
(async () => {
  if (!URL_ || !PW || !KPW) throw new Error('ROOM_URL, ROOM_PW, KEEPER_PW가 필요해요');
  const d0 = await call({ action: 'data' }); if (!d0.ok) throw new Error('방에 들어가지 못했어요: ' + d0.error);
  if (!/테스트|연습|test/i.test(d0.roomTitle || '')) throw new Error('방 이름("' + d0.roomTitle + '")에 "테스트"나 "연습"이 없어요. 연습 방에서만 돌려요');
  const kl = await call({ action: 'klogin', kpw: KPW }); if (!kl.ok) throw new Error('마스터 로그인 실패: ' + kl.error); const kt = kl.kt || kl.token;
  const run = Date.now().toString(36);
  const feed = async (lines, tag) => { const items = lines.map((l, i) => ({ uid: 'q' + run + tag + i, name: l[0], text: l[1], t: new Date(Date.now() - (lines.length - i) * 4000).toISOString() })); const r = await call({ action: 'lines', items }); if (!r.ok || r.saved.length !== items.length) throw new Error('대본을 넣지 못했어요: ' + JSON.stringify(r).slice(0, 200)); };
  const summarize = async () => { for (let i = 0; i < 12; i++) { const r = await call({ action: 'process' }); if (r.ok && !r.more) return; if (!r.ok && !r.busy) console.log('요약 응답: ' + (r.error || '')); await sleep(8000); } throw new Error('요약이 끝나지 않았어요'); };
  console.log('세션 1 대본 ' + session1.length + '줄 넣는 중…'); await feed(session1, 'a'); await summarize();
  const ns = await call({ action: 'newSession', kt }); if (!ns.ok) throw new Error('새 세션을 시작하지 못했어요: ' + ns.error); console.log('세션 ' + ns.session + ' 시작');
  console.log('세션 2 대본 ' + session2.length + '줄 넣는 중…'); await feed(session2, 'b'); await summarize();
  let nx = null; for (let i = 0; i < 5; i++) { nx = await call({ action: 'nextSteps', force: true }); if (nx.ok && nx.next && !nx.wait && !nx.busy) break; await sleep(20000); }
  const d = await call({ action: 'data' });
  const out = { at: new Date().toISOString(), ver: d.code || '', session: ns.session, kbUploaded: null,
    summary: (d.summaries || []).filter(s => String(s.session) === String(ns.session)).map(s => s.text).join('\n'), notes: d.notes, next: nx && nx.next, nextFresh: nx && nx.fresh };
  const f = path.join(process.cwd(), 'quality-out.json'); fs.writeFileSync(f, JSON.stringify(out, null, 2)); console.log('결과 저장: ' + f);
  const r = score(out); Object.keys(r.metrics).forEach(k => console.log(k + ': ' + r.metrics[k])); Object.keys(r.detail).forEach(k => { if (r.detail[k].length) console.log('  · ' + k + ': ' + r.detail[k].join(' / ')); });
  console.log('합격선: ' + (r.pass ? '넘음' : '못 넘음') + '  (마스터 자료 누출은 연습 방에 keeperOnly 글을 올려 두었을 때만 뜻이 있어요)');
  console.log('사람이 읽고 확인할 것:'); r.manual.forEach((x, i) => console.log((i + 1) + '. ' + x));
  void keeperOnly;
})().catch(e => { console.error('멈춤: ' + e.message); process.exit(1); });
