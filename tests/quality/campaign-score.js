/* 가상 캠페인(campaign.js) 채점. 사용: node tests/quality/campaign-score.js <결과.json>
 * 결과.json = { summaries: { "1": "세션 1 요약 글 전체", … "10": … }, notes: { npcs:[{name,aka}], clues:[{text,status}] }, radar: { items:[{kind,id,title}] } }
 * 재는 것 (세션마다 더해서 비율로)
 *   NPC 누락: 그 세션에 나온 NPC가 요약에 없음 (이름이나 다른 이름)
 *   단서 누락: 그 세션에 나온 단서·풀린 단서가 요약에 없음
 *   판정: 기술 이름이 나온 줄의 성공/실패가 맞는지 (빠짐·뒤바뀜)
 *   함정: 농담·가정·게임 밖 잡담을 요약에 사건으로 적음
 *   정리: 단서의 해결/미해결 상태가 정답과 같은지
 *   레이더: 정답표의 후보를 찾았는지(재현율), 엉뚱한 후보는 없는지(정밀도). 레이더는 이름으로 맞춘다(정리 id는 방마다 다르다)
 * 정규식으로 낱말이 있는지만 본다. 뜻이 틀린 문장은 놓치므로 사람이 읽고 확인할 것 목록을 같이 낸다. */
const { build, NPCS, CLUES } = require('./campaign.js');
function score(out, seed) {
  const C = build(seed), key = C.key, sums = out.summaries || {}, res = { sessions: {}, totals: {} };
  const T = { npc: [0, 0], found: [0, 0], solved: [0, 0], rollOk: 0, rollMiss: 0, rollFlip: 0, rolls: 0, traps: 0 };
  for (let s = 1; s <= C.N; s++) {
    const k = key.perSession[s], sum = String(sums[s] || sums[String(s)] || ''), lines = sum.split('\n');
    const npcHit = k.npcs.filter(n => { const x = NPCS.find(y => y.name === n); return sum.indexOf(n) >= 0 || (x && sum.indexOf(x.aka) >= 0); });
    const fHit = k.found.filter(f => new RegExp(f.re).test(sum)), sHit = k.solved.filter(f => new RegExp(f.re).test(sum));
    const rolls = k.rolls.map(r => { const hit = lines.filter(l => l.indexOf(r.skill) >= 0 && /성공|실패/.test(l)); if (!hit.length) return '빠짐'; const other = r.result === '성공' ? '실패' : '성공'; return hit.some(l => l.indexOf(other) >= 0 && l.indexOf(r.result) < 0) ? '뒤바뀜' : '맞음'; });
    const traps = k.traps.filter(t => new RegExp(t.re).test(sum));
    T.npc[0] += npcHit.length; T.npc[1] += k.npcs.length; T.found[0] += fHit.length; T.found[1] += k.found.length; T.solved[0] += sHit.length; T.solved[1] += k.solved.length;
    T.rolls += rolls.length; rolls.forEach(x => { if (x === '맞음') T.rollOk++; else if (x === '빠짐') T.rollMiss++; else T.rollFlip++; }); T.traps += traps.length;
    res.sessions[s] = { empty: !sum.trim(), npcMissing: k.npcs.filter(n => npcHit.indexOf(n) < 0), foundMissing: k.found.filter(f => fHit.indexOf(f) < 0).map(f => f.id), solvedMissing: k.solved.filter(f => sHit.indexOf(f) < 0).map(f => f.id), rolls, traps: traps.map(t => t.re) };
  }
  // 정리: 단서 상태
  const nc = (out.notes && out.notes.clues) || [];
  const status = CLUES.map(c => { const hit = nc.find(x => new RegExp(c.re).test(String(x.text || ''))); return { id: c.id, want: c.solved ? '해결' : '미해결', got: hit ? String(hit.status || '') : '없음' }; });
  // 레이더: 이름(또는 단서 낱말)으로 맞춘다
  const ri = (out.radar && out.radar.items) || [];
  const wantN = key.radar.npc.map(x => NPCS.find(y => y.id === x.id)), wantC = key.radar.clue.map(x => CLUES.find(y => y.id === x.id));
  const isN = (it, x) => it.kind === 'npc' && (String(it.title).indexOf(x.aka) >= 0 || String(it.title).indexOf(x.name) >= 0);
  const isC = (it, c) => it.kind === 'clue' && new RegExp(c.re).test(String(it.title));
  const found = wantN.filter(x => ri.some(it => isN(it, x))).length + wantC.filter(c => ri.some(it => isC(it, c))).length;
  const extra = ri.filter(it => !wantN.some(x => isN(it, x)) && !wantC.some(c => isC(it, c))).map(it => it.kind + ':' + it.title);
  const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
  res.totals = {
    npcRecall: pct(T.npc[0], T.npc[1]), clueRecall: pct(T.found[0] + T.solved[0], T.found[1] + T.solved[1]),
    rollOk: pct(T.rollOk, T.rolls), rollFlip: T.rollFlip, rollMiss: T.rollMiss, traps: T.traps,
    statusOk: pct(status.filter(x => x.want === x.got).length, status.length), statusWrong: status.filter(x => x.want !== x.got),
    radarRecall: pct(found, wantN.length + wantC.length), radarExtra: extra, emptySessions: Object.keys(res.sessions).filter(s => res.sessions[s].empty)
  };
  const t = res.totals;
  res.verdict = t.emptySessions.length ? '확인 못 함 (요약이 없는 세션이 있음)'
    : (t.rollFlip || t.traps || t.radarRecall < 100 || t.radarExtra.length || t.npcRecall < 90 || t.clueRecall < 90 || t.statusOk < 100) ? '불합격' : '자동 채점 합격 (사람 확인 남음)';
  res.manual = ['요약이 세션 순서대로 사건을 바르게 이었는지 (특히 풀린 단서가 풀린 세션에 적혔는지)', '농담·가정이 "했다"로 바뀌지 않았는지 문장으로 읽어 보기', 'NPC 이름이 다른 NPC와 섞이지 않았는지'];
  return res;
}
function report(r) {
  const t = r.totals, L = [];
  L.push('판정: ' + r.verdict);
  L.push('NPC 나온 세션 기록률 ' + t.npcRecall + '% · 단서 기록률 ' + t.clueRecall + '% · 판정 맞음 ' + t.rollOk + '% (뒤바뀜 ' + t.rollFlip + ', 빠짐 ' + t.rollMiss + ') · 함정을 사건으로 적음 ' + t.traps + '건');
  L.push('단서 상태 맞음 ' + t.statusOk + '%' + (t.statusWrong.length ? ' (틀림: ' + t.statusWrong.map(x => x.id + ' ' + x.want + '→' + x.got).join(', ') + ')' : ''));
  L.push('레이더 찾음 ' + t.radarRecall + '%' + (t.radarExtra.length ? ' · 정답에 없는 후보: ' + t.radarExtra.join(', ') : ''));
  Object.keys(r.sessions).forEach(s => { const x = r.sessions[s], bad = [x.npcMissing.length && 'NPC 빠짐 ' + x.npcMissing.join('/'), x.foundMissing.length && '단서 빠짐 ' + x.foundMissing.join('/'), x.solvedMissing.length && '풀린 단서 빠짐 ' + x.solvedMissing.join('/'), x.rolls.some(y => y !== '맞음') && '판정 ' + x.rolls.join('/'), x.traps.length && '함정 ' + x.traps.join('/')].filter(Boolean); if (bad.length) L.push('  세션 ' + s + ': ' + bad.join(' · ')); });
  L.push('사람이 읽고 확인할 것:'); r.manual.forEach(m => L.push('  □ ' + m));
  return L.join('\n');
}
module.exports = { score, report };
if (require.main === module) { const f = process.argv[2]; if (!f) { console.log('사용: node tests/quality/campaign-score.js <결과.json>'); process.exit(2); } const r = score(JSON.parse(require('fs').readFileSync(f, 'utf8'))); console.log(report(r)); process.exit(/불합격/.test(r.verdict) ? 1 : 0); }
