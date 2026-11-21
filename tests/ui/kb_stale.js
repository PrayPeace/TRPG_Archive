// 시나리오 자료 올리기: 화면이 자료를 받아 온 뒤 누가 "전체 지우기"를 했을 때 (실제 사용에서 나온 오류, 11-21.28)
const { chromium } = require('playwright'); const { open, ok, done } = require('./harness.js');
const kb = { truth: '', memo: '', glossary: '', done: [], deleted: {}, npcs: [], places: [], clues: [], rolls: [], scenes: [] };
(async () => {
  const b = await chromium.launch();
  const S = { gen: '0', adds: [], midClear: false };
  const handle = (a, j) => {
    if (a === 'kData') return { ok: true, kb, sources: [], pending: 0, chunks: 0, board: null, recaps: [], awardsLogs: [], feedbacks: [], npcLog: [], rollLog: [], recap: null, awards: null, rollsTotal: 0, sessions: [], session: '1', keeperName: '대장', resetVer: '1', kbGen: S.gen, weak: false, code: '' };
    if (a === 'kSrcAdd') {
      if (j.gen != null && String(j.gen) !== S.gen) return { ok: false, stale: true, error: '그 사이 시나리오 자료를 모두 지웠어요' };
      S.adds.push(j.gen); if (S.midClear) S.gen = String(Number(S.gen) + 1);
      return { ok: true, added: j.parts.length };
    }
    if (a === 'kDigest') return { ok: true, done: true };
    return null;
  };
  const { p } = await open(b, { handle, session: { t_kt: 'KT1' } });
  await p.waitForTimeout(1500);
  await p.evaluate(() => kLoad()); await p.waitForTimeout(300);
  // ① 화면이 gen 0으로 받아 온 뒤 다른 곳에서 전체 지우기 (서버 gen 1) → 올리기는 새 번호로 한 번 다시 보내 성공해야 한다
  S.gen = '1';
  const r1 = await p.evaluate(async () => { K.kbF = { paste: '첫 자료 '.repeat(50), source: '시나리오', doc: '' }; K.stop = true; await kUpload({ files: [], value: '' }); return { gen: K.gen, msg: (document.getElementById('kProg') || {}).textContent || '' }; });
  ok('올리기 전에 지워졌으면 새 자료 번호를 받아 다시 보내 성공', S.adds.length === 1 && S.adds[0] === '1' && r1.gen === '1', JSON.stringify({ adds: S.adds, r1 }));
  // ② 올리는 도중에 지워지면 (첫 묶음은 들어간 뒤) 다시 보내지 않고 멈춘다: 지우기 전 조각과 뒤 조각이 섞이지 않게
  S.adds = []; S.midClear = true;
  const long = 'ㄱ'.repeat(7000 * 7 + 10);
  const r2 = await p.evaluate(async t => { K.kbF = { paste: t, source: '긴 자료', doc: '' }; K.stop = true; let m = ''; const o = window.kProg; window.kProg = (t, e) => { if (e) m = t; o(t, e); }; await kUpload({ files: [], value: '' }); window.kProg = o; return m; }, long);
  ok('올리는 도중에 지워지면 다시 보내지 않고 "실패"로 멈춤', S.adds.length === 1 && /^실패: 그 사이 시나리오 자료를 모두 지웠어요/.test(r2), JSON.stringify({ adds: S.adds, r2 }));
  await b.close(); done();
})();
