/* 실제 Claude로 AI 품질을 재는 도구. 연습 방에서만 돈다. 이 저장소의 자동 시험·GitHub 검사에서는 돌지 않는다 (요금이 들고 실제 방에 글을 쓰므로).
 * 사용 (PC에서):
 *   ROOM_URL="https://script.google.com/macros/s/…/exec" QUALITY_ROOM_ID="그 주소의 /s/ 와 /exec 사이 글자" ROOM_PW="방 비밀번호" KEEPER_PW="마스터 비밀번호" node tests/quality/run-real.js
 * 안전장치 (셋 다 맞아야 돈다. 하나라도 어긋나면 방에 아무것도 쓰지 않고 멈춘다):
 *   ① QUALITY_ROOM_ID가 ROOM_URL의 배포ID와 글자 그대로 같아야 한다 (이 방에 시험 대본을 넣어도 된다고 사람이 따로 적어 준 것. 방 이름만으로 판단하지 않는다)
 *   ② 방 이름에 "테스트"나 "연습"이 있어야 한다
 *   ③ PROD_ROOMS(운영 방 목록)를 함께 주면 거기에 든 방이 아니어야 한다
 * 하는 일: 세션 1 대본 → 요약 → 새 세션 → 세션 2 대본 → 요약 → 다음 할 일(force) → 결과를 quality-out.json에 저장 → score.js로 채점
 * 마스터 자료 누출: 마스터 자료(fixture.js의 keeperOnly)가 그 방에 실제로 올라가 있는지 서버에 물어서 확인한다. 확인되지 않으면 누출 항목은 "확인 못 함"이고 전체 판정도 합격이 되지 않는다.
 * 독립 환경: 시험할 때마다 새로 만든(또는 기록을 비운) 연습 방을 쓰는 것이 좋다. 방에 이미 대화가 있으면 결과에 mixed 표시가 붙고 판정이 "미확인"이 된다 (예전 대본의 요약·정리가 섞였을 수 있어서). 이 도구는 기록을 지우지 않는다.
 * Claude 호출: 요약 2~4번 + 정리 + 추천 1번 정도. */
const fs = require('fs'), path = require('path');
const { session1, session2, keeperOnly } = require('./fixture.js'), { score, report } = require('./score.js');
const URL_ = process.env.ROOM_URL, PW = process.env.ROOM_PW, KPW = process.env.KEEPER_PW;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = async body => (await fetch(URL_, { method: 'POST', body: JSON.stringify(Object.assign({ pw: PW }, body)), redirect: 'follow' })).json();
(async () => {
  if (!URL_ || !PW || !KPW) throw new Error('ROOM_URL, ROOM_PW, KEEPER_PW가 필요해요');
  const did = (/\/macros\/s\/([-\w]+)\/exec/.exec(URL_) || [])[1] || '';
  if (!did || String(process.env.QUALITY_ROOM_ID || '').trim() !== did) throw new Error('QUALITY_ROOM_ID가 ROOM_URL의 배포ID와 같지 않아요. 시험 대본을 넣어도 되는 방의 배포ID(/s/ 와 /exec 사이 글자)를 QUALITY_ROOM_ID에 그대로 적어 주세요. 방에는 아무것도 쓰지 않았어요');
  if (String(process.env.PROD_ROOMS || '').indexOf(did) >= 0) throw new Error('이 방은 운영 방 목록(PROD_ROOMS)에 들어 있어요. 운영 방에서는 돌리지 않아요');
  const d0 = await call({ action: 'data' }); if (!d0.ok) throw new Error('방에 들어가지 못했어요: ' + d0.error);
  if (!/테스트|연습|test/i.test(d0.roomTitle || '')) throw new Error('방 이름("' + d0.roomTitle + '")에 "테스트"나 "연습"이 없어요. 연습 방에서만 돌려요');
  const before = Number((d0.v && d0.v.total) || 0), mixed = before > 0;
  if (mixed) console.log('⚠ 이 방에 이미 대화가 ' + before + '줄 있어요. 예전 기록의 요약·정리가 섞일 수 있어서 이번 결과는 "미확인"으로 표시돼요. 새로 만든 연습 방에서 돌리는 것이 좋아요');
  const kl = await call({ action: 'klogin', kpw: KPW }); if (!kl.ok) throw new Error('마스터 로그인 실패: ' + kl.error); const kt = kl.kt || kl.token;
  const run = Date.now().toString(36);
  const feed = async (lines, tag) => { const items = lines.map((l, i) => ({ uid: 'q' + run + tag + i, name: l[0], text: l[1], t: new Date(Date.now() - (lines.length - i) * 4000).toISOString() })); const r = await call({ action: 'lines', items }); if (!r.ok || r.saved.length !== items.length) throw new Error('대본을 넣지 못했어요: ' + JSON.stringify(r).slice(0, 200)); };
  const summarize = async () => { for (let i = 0; i < 12; i++) { const r = await call({ action: 'process' }); if (r.ok && !r.more) return; if (!r.ok && !r.busy) console.log('요약 응답: ' + (r.error || '')); await sleep(8000); } throw new Error('요약이 끝나지 않았어요'); };
  console.log('세션 1 대본 ' + session1.length + '줄 넣는 중…'); await feed(session1, 'a'); await summarize();
  const ns = await call({ action: 'newSession', kt }); if (!ns.ok) throw new Error('새 세션을 시작하지 못했어요: ' + ns.error); console.log('세션 ' + ns.session + ' 시작');
  console.log('세션 2 대본 ' + session2.length + '줄 넣는 중…'); await feed(session2, 'b'); await summarize();
  let nx = null; for (let i = 0; i < 5; i++) { nx = await call({ action: 'nextSteps', force: true }); if (nx.ok && nx.next && !nx.wait && !nx.busy) break; await sleep(20000); }
  const d = await call({ action: 'data' });
  // 마스터 자료가 실제로 올라가 있는지: 마스터 화면 자료(kData)에 keeperOnly에만 있는 낱말이 들어 있는지 본다. 확인하지 못하면 null (누출 0건을 합격으로 치지 않는다)
  let kbUploaded = null;
  try { const kd = await call({ action: 'kData', kt }); if (kd && kd.ok) kbUploaded = Number(kd.chunks || 0) > 0 && /0412|에드먼드/.test(JSON.stringify([kd.kb, kd.sources])); } catch (e) { kbUploaded = null; }
  console.log('마스터 자료 등록: ' + (kbUploaded === true ? '확인됨' : kbUploaded === false ? '올라가 있지 않음 (누출 항목은 "확인 못 함")' : '확인하지 못함'));
  const out = { at: new Date().toISOString(), ver: d.code || '', session: ns.session, kbUploaded, mixed, linesBefore: before,
    summary: (d.summaries || []).filter(s => String(s.session) === String(ns.session)).map(s => s.text).join('\n'), notes: d.notes, next: nx && nx.next, nextFresh: nx && nx.fresh };
  const f = path.join(process.cwd(), 'quality-out.json'); fs.writeFileSync(f, JSON.stringify(out, null, 2)); console.log('결과 저장: ' + f);
  report(score(out));
  void keeperOnly;
})().catch(e => { console.error('멈춤: ' + e.message); process.exit(1); });
