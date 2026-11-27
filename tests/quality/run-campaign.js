/* 가상 캠페인 10세션(campaign.js)을 실제 연습 방에 넣고, 실제 Claude가 만든 요약·정리와 떡밥 레이더를 정답표로 채점하는 도구.
 * 이 저장소의 자동 시험·GitHub 검사에서는 돌지 않는다 (요금이 들고 실제 방에 글을 쓰므로). 아직 한 번도 돌린 적이 없다.
 * 사용 (PC에서, 새로 만든 연습 방에서):
 *   ROOM_URL="https://script.google.com/macros/s/…/exec" QUALITY_ROOM_ID="그 주소의 /s/ 와 /exec 사이 글자" ROOM_PW="방 비밀번호" KEEPER_PW="마스터 비밀번호" node tests/quality/run-campaign.js
 * 안전장치는 run-real.js와 같다 (셋 다 맞아야 돈다. 하나라도 어긋나면 방에 아무것도 쓰지 않고 멈춘다):
 *   ① QUALITY_ROOM_ID가 ROOM_URL의 배포ID와 글자 그대로 같음  ② 방 이름에 "테스트"나 "연습"이 있음  ③ PROD_ROOMS에 든 방이 아님
 * 하는 일: 세션마다 [새 세션 → 대본 넣기 → 요약이 끝날 때까지 기다림] × 10 → 요약·정리·레이더를 campaign-out.json에 저장 → campaign-score.js로 채점
 * Claude 호출: 세션마다 요약 1~2번 + 정리 1번 정도, 모두 20~40번. 요금이 든다. 질긴 결속에서는 돌리지 말 것. */
const fs = require('fs'), path = require('path');
const { build } = require('./campaign.js'), { score, report } = require('./campaign-score.js');
const URL_ = process.env.ROOM_URL, PW = process.env.ROOM_PW, KPW = process.env.KEEPER_PW;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = async body => (await fetch(URL_, { method: 'POST', body: JSON.stringify(Object.assign({ pw: PW }, body)), redirect: 'follow' })).json();
(async () => {
  if (!URL_ || !PW || !KPW) throw new Error('ROOM_URL, ROOM_PW, KEEPER_PW가 필요해요');
  const did = (/\/macros\/s\/([-\w]+)\/exec/.exec(URL_) || [])[1] || '';
  if (!did || String(process.env.QUALITY_ROOM_ID || '').trim() !== did) throw new Error('QUALITY_ROOM_ID가 ROOM_URL의 배포ID와 같지 않아요. 방에는 아무것도 쓰지 않았어요');
  if (String(process.env.PROD_ROOMS || '').indexOf(did) >= 0) throw new Error('이 방은 운영 방 목록(PROD_ROOMS)에 들어 있어요. 운영 방에서는 돌리지 않아요');
  const d0 = await call({ action: 'data' }); if (!d0.ok) throw new Error('방에 들어가지 못했어요: ' + d0.error);
  if (!/테스트|연습|test/i.test(d0.roomTitle || '')) throw new Error('방 이름("' + d0.roomTitle + '")에 "테스트"나 "연습"이 없어요. 연습 방에서만 돌려요');
  const before = Number((d0.v && d0.v.total) || 0);
  if (before > 0) console.log('⚠ 이 방에 이미 대화가 ' + before + '줄 있어요. 예전 기록이 섞여 판정이 흐려질 수 있어요. 새 연습 방을 쓰는 것이 좋아요');
  const kl = await call({ action: 'klogin', kpw: KPW }); if (!kl.ok) throw new Error('마스터 로그인 실패: ' + kl.error); const kt = kl.kt || kl.token;
  const C = build(), run = Date.now().toString(36), map = {};
  const summarize = async () => { for (let i = 0; i < 15; i++) { const r = await call({ action: 'process' }); if (r.ok && !r.more) return; if (!r.ok && !r.busy) console.log('요약 응답: ' + (r.error || '')); await sleep(8000); } throw new Error('요약이 끝나지 않았어요'); };
  for (let s = 1; s <= C.N; s++) {
    if (s > 1 || before > 0) { const ns = await call({ action: 'newSession', kt }); if (!ns.ok) throw new Error('새 세션을 시작하지 못했어요: ' + ns.error); map[s] = String(ns.session); }
    else map[s] = String((d0.v && d0.v.session) || '1');
    const L = C.sessions[s], items = L.map((l, i) => ({ uid: 'qc' + run + '_' + l.uid, name: l.name, text: l.text, t: new Date(Date.now() - (L.length - i) * 4000).toISOString() }));
    const r = await call({ action: 'lines', items }); if (!r.ok || r.saved.length !== items.length) throw new Error('세션 ' + s + ' 대본을 넣지 못했어요: ' + JSON.stringify(r).slice(0, 200));
    console.log('세션 ' + s + ' (방 세션 ' + map[s] + ') ' + L.length + '줄 넣음 · 요약 기다리는 중…');
    await summarize();
  }
  const d = await call({ action: 'data' }), rd = await call({ action: 'radar' });
  const summaries = {}; Object.keys(map).forEach(s => { summaries[s] = (d.summaries || []).filter(x => String(x.session) === map[s]).map(x => x.text).join('\n'); });
  const out = { at: new Date().toISOString(), sessionMap: map, linesBefore: before, summaries, notes: d.notes, radar: rd };
  const f = path.join(process.cwd(), 'campaign-out.json'); fs.writeFileSync(f, JSON.stringify(out, null, 2)); console.log('결과 저장: ' + f);
  console.log(report(score(out)));
})().catch(e => { console.error('멈춤: ' + e.message); process.exit(1); });
