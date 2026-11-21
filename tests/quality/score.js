/* AI 품질 채점 (정답표와 비교). 사용: node tests/quality/score.js <결과.json>
 * 결과.json = { summary: "세션 2 요약 글 전체", notes: { clues:[{text,status,kind}], npcs:[...], places:[...] }, next: { now:{scene,...}, items:[{title,why,prio,...}] } }
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
  const m = {
    '단서 누락률': missing.length + '/' + key.facts.length,
    '지어낸 사실·농담·가정을 사건으로 적음': bad.filter(x => ['농담', '가정', '잡담', '지어냄'].includes(x.kind)).length,
    '판정 성공/실패 뒤바뀜': rolls.filter(r => r.state === '뒤바뀜').length, '판정 빠짐': rolls.filter(r => r.state === '빠짐').length,
    '주장을 사실처럼 적음': claims.filter(c => c.state === '사실처럼 적음').length, '추측을 사실처럼 적음': guesses.filter(c => c.state === '사실처럼 적음').length,
    '이미 끝난 일을 다시 추천': repeat.length, '추천에 빠진 것': nextMiss.length, '하기로 한 일이 맨 위에 없음': prioMiss.length,
    '마스터 자료 누출': bad.filter(x => x.kind === '비밀 누출').length, '받아쓰기 표시·안내를 요약에 옮김': bad.filter(x => x.kind === '기계 안내').length, '잘못 들린 낱말을 그대로 적음': bad.filter(x => x.kind === '인식 오류').length,
    '지금 장면이 맞음': key.scene && new RegExp(key.scene.re).test(scene) ? '예' : '아니오 (' + (scene || '없음') + ')'
  };
  // 합격선(제안): 실제 시험에서 이 선을 넘는지 본다
  const pass = missing.length <= 1 && m['지어낸 사실·농담·가정을 사건으로 적음'] === 0 && m['판정 성공/실패 뒤바뀜'] === 0 && m['주장을 사실처럼 적음'] === 0 && m['이미 끝난 일을 다시 추천'] === 0 && m['마스터 자료 누출'] === 0;
  return { metrics: m, pass, detail: { missing: missing.map(f => f.desc), forbidden: bad.map(x => '[' + x.kind + '] ' + x.desc), rolls: rolls.filter(r => r.state !== '맞음').map(r => r.skill + ' ' + r.result + ' → ' + r.state),
    claims: claims.concat(guesses).filter(c => c.state !== '맞음').map(c => c.desc + ' → ' + c.state), repeat: repeat.map(s => s.desc), nextMiss: nextMiss.map(n => n.desc) }, manual: key.manual };
}
module.exports = { score };
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('사용: node tests/quality/score.js <결과.json>'); process.exit(2); }
  const r = score(JSON.parse(require('fs').readFileSync(f, 'utf8')));
  console.log('── 자동 채점 ──'); Object.keys(r.metrics).forEach(k => console.log(k + ': ' + r.metrics[k]));
  Object.keys(r.detail).forEach(k => { if (r.detail[k].length) console.log('  · ' + k + ': ' + r.detail[k].join(' / ')); });
  console.log('합격선(누락 1개 이하, 지어냄·뒤바뀜·주장 혼동·반복 추천·누출 0): ' + (r.pass ? '넘음' : '못 넘음'));
  console.log('── 사람이 읽고 확인할 것 ──'); r.manual.forEach((x, i) => console.log((i + 1) + '. ' + x));
}
