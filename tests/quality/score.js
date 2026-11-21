/* AI 품질 채점 (정답표와 비교). 사용: node tests/quality/score.js <결과.json>
 * 결과.json = { kbUploaded: 마스터 자료가 방에 올라가 있었는지(true일 때만 누출 0건을 인정), mixed: 앞선 시험 기록이 섞였는지, summary: "세션 2 요약 글 전체", notes: { clues:[{text,status,kind}], npcs:[...], places:[...] }, next: { now:{scene,...}, items:[{title,why,prio,...}] } }
 * 정규식으로 가릴 수 있는 것만 센다. 사람이 읽고 확인할 항목은 manual 목록으로 따로 내준다. 이 채점은 실제 AI 출력을 넣었을 때만 뜻이 있다. */
const { key } = require('./fixture.js');
function score(out) {
  const sum = String(out.summary || ''), notesTxt = JSON.stringify(out.notes || {}), nextTxt = JSON.stringify(out.next || {});
  const pub = sum + '\n' + notesTxt, src = { sum, notes: notesTxt, next: nextTxt };
  const R = s => new RegExp(s);
  const lines = pub.split(/\n|","|"\},\{"/);
  const missing = key.facts.filter(f => !R(f.re).test(pub));
  const bad = key.forbidden.filter(x => x.where.some(w => R(x.re).test(src[w])));
  // 판정: 기술 이름이 나온 줄에서 결과를 읽는다. 줄이 없으면 "빠짐", 결과가 반대면 "뒤바뀜"
  const rolls = key.rolls.map(r => {
    const hit = lines.filter(l => R(r.skill).test(l) && /성공|실패/.test(l));
    if (!hit.length) return Object.assign({ state: '빠짐' }, r);
    const other = r.result === '성공' ? '실패' : '성공';
    const wrong = hit.some(l => l.indexOf(other) >= 0 && l.indexOf(r.result) < 0);
    return Object.assign({ state: wrong ? '뒤바뀜' : '맞음' }, r);
  });
  // 주장·추측: 그 내용이 나온 줄에 표시(주장/추측)가 없거나 단정한 문장이 있으면 혼동
  const mark = list => list.map(c => { const hit = lines.filter(l => R(c.near).test(l)); if (!hit.length) return Object.assign({ state: '빠짐' }, c); const asFact = hit.some(l => R(c.asFact).test(l) || !R(c.marker).test(l)); return Object.assign({ state: asFact ? '사실처럼 적음' : '맞음' }, c); });
  const claims = mark(key.claims), guesses = mark(key.guesses);
  const items = (out.next && out.next.items) || [];
  const repeat = key.solved.filter(s => items.some(i => R(s.re).test(i.title + ' ' + (i.why || ''))));
  const nextMiss = key.nextMust.filter(n => !items.some(i => R(n.re).test(i.title + ' ' + (i.why || ''))));
  const top = items.filter(i => i.prio === 1), prioMiss = key.nextMust.filter(n => n.prio1 && !top.some(i => R(n.re).test(i.title + ' ' + (i.why || ''))));
  const scene = String((out.next && out.next.now && out.next.now.scene) || '');
  const coreMiss = missing.filter(f => f.core), extraMiss = missing.filter(f => !f.core), coreN = key.facts.filter(f => f.core).length;
  const noNext = !items.length;                                         // AI가 추천을 만들지 못함: 추천 항목은 "0건"이 아니라 "확인 못 함"이다
  const leakN = bad.filter(x => x.kind === '비밀 누출').length, kbKnown = out.kbUploaded === true;     // 마스터 자료가 실제로 올라가 있었는지 확인했을 때만 누출 0건이 뜻이 있다
  const sceneOk = !!(key.scene && new RegExp(key.scene.re).test(scene));
  const m = {
    '핵심 단서 누락': coreMiss.length + '/' + coreN, '부가 정보 누락': extraMiss.length + '/' + (key.facts.length - coreN),
    '단서 누락률': missing.length + '/' + key.facts.length,
    '지어낸 사실·농담·가정을 사건으로 적음': bad.filter(x => ['농담', '가정', '잡담', '지어냄'].includes(x.kind)).length,
    '판정 성공/실패 뒤바뀜': rolls.filter(r => r.state === '뒤바뀜').length, '판정 빠짐': rolls.filter(r => r.state === '빠짐').length,
    '주장을 사실처럼 적음': claims.filter(c => c.state === '사실처럼 적음').length, '추측을 사실처럼 적음': guesses.filter(c => c.state === '사실처럼 적음').length,
    '추천을 만들었나': noNext ? '아니오' : '예 (' + items.length + '개)',
    '이미 끝난 일을 다시 추천': noNext ? '확인 못 함' : repeat.length, '추천에 빠진 것': noNext ? '확인 못 함' : nextMiss.length, '하기로 한 일이 맨 위에 없음': noNext ? '확인 못 함' : prioMiss.length,
    '마스터 자료 누출': leakN ? leakN : kbKnown ? 0 : '확인 못 함 (마스터 자료가 방에 올라가 있었는지 확인하지 못함)',
    '받아쓰기 표시·안내를 요약에 옮김': bad.filter(x => x.kind === '기계 안내').length, '잘못 들린 낱말을 그대로 적음': bad.filter(x => x.kind === '인식 오류').length,
    '지금 장면이 맞음': noNext ? '확인 못 함' : sceneOk ? '예' : '아니오 (' + (scene || '없음') + ')'
  };
  /* 판정: 불합격 사유가 하나라도 있으면 "불합격". 없더라도 확인하지 못한 항목이 있으면 "미확인"(합격이 아님). 둘 다 없을 때만 "자동 채점 합격".
   * 자동 채점 합격도 정규식으로 낱말이 있는지 본 것뿐이라 뜻이 맞는지는 보장하지 않는다 → 사람 확인 목록(manual)까지 끝나야 합격이라고 말할 수 있다. */
  const fail = [], unknown = [];
  if (coreMiss.length) fail.push('핵심 단서 ' + coreMiss.length + '개 누락 (합격선 0)');
  if (extraMiss.length > 1) fail.push('부가 정보 ' + extraMiss.length + '개 누락 (합격선 1 이하)');
  if (m['지어낸 사실·농담·가정을 사건으로 적음']) fail.push('지어낸 사실·농담·가정을 사건으로 적음');
  if (m['판정 성공/실패 뒤바뀜']) fail.push('판정 성공/실패 뒤바뀜');
  if (m['주장을 사실처럼 적음']) fail.push('NPC 주장을 사실처럼 적음');
  if (m['추측을 사실처럼 적음']) fail.push('플레이어 추측을 사실처럼 적음');
  if (leakN) fail.push('마스터 자료 누출'); else if (!kbKnown) unknown.push('마스터 자료 누출 (자료 등록을 확인하지 못함)');
  if (noNext) fail.push('AI가 추천을 만들지 못함 (다른 항목이 좋아도 합격이 아님)');
  else {
    if (repeat.length) fail.push('이미 끝난 일을 다시 추천');
    if (!sceneOk) fail.push('지금 장면이 틀림');
    if (prioMiss.length) fail.push('하기로 한 일이 맨 위에 없음');
    if (nextMiss.length) fail.push('추천에 있어야 할 일이 빠짐 (' + nextMiss.length + '개)');
  }
  if (out.mixed) unknown.push('이 방에 앞선 시험의 기록이 섞여 있음 (요약·정리가 예전 대본의 영향을 받았을 수 있음)');
  const verdict = fail.length ? '불합격' : unknown.length ? '미확인' : '자동 채점 합격';
  return { metrics: m, pass: verdict === '자동 채점 합격', verdict, fail, unknown, detail: { missing: missing.map(f => (f.core ? '[핵심] ' : '[부가] ') + f.desc), forbidden: bad.map(x => '[' + x.kind + '] ' + x.desc), rolls: rolls.filter(r => r.state !== '맞음').map(r => r.skill + ' ' + r.result + ' → ' + r.state),
    claims: claims.concat(guesses).filter(c => c.state !== '맞음').map(c => c.desc + ' → ' + c.state), repeat: repeat.map(s => s.desc), nextMiss: nextMiss.map(n => n.desc) }, manual: key.manual };
}
// 결과를 사람이 읽게 찍는다
function report(r, log) {
  log = log || console.log;
  log('── 자동 채점 (정규식으로 낱말이 있는지만 봄. 뜻이 맞는지는 아래 사람 확인으로) ──');
  Object.keys(r.metrics).forEach(k => log(k + ': ' + r.metrics[k]));
  Object.keys(r.detail).forEach(k => { if (r.detail[k].length) log('  · ' + k + ': ' + r.detail[k].join(' / ')); });
  log('판정: ' + r.verdict + (r.fail.length ? ' · 사유: ' + r.fail.join(', ') : '') + (r.unknown.length ? ' · 확인 못 한 것: ' + r.unknown.join(', ') : ''));
  log('합격선: 핵심 단서 누락 0, 부가 정보 누락 1 이하, 지어냄·판정 뒤바뀜·주장 혼동·추측 혼동·반복 추천·누출 0, 추천이 만들어짐, 지금 장면이 맞음, 하기로 한 일이 맨 위, 있어야 할 추천이 빠지지 않음');
  log('── 사람이 읽고 확인할 것 (이것까지 끝나야 합격이라고 말할 수 있어요) ──'); r.manual.forEach((x, i) => log((i + 1) + '. ' + x));
}
module.exports = { score, report };
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('사용: node tests/quality/score.js <결과.json>'); process.exit(2); }
  report(score(JSON.parse(require('fs').readFileSync(f, 'utf8'))));
}
