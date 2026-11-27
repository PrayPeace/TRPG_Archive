// 새 말 확인(poll)이 멈추지 않는지: 응답 하나가 끝없이 안 오거나, 자료(data) 받기가 늦어도 계속 새 말을 받아 오는지.
// 11-27 질긴 결속 세션 2: 받아쓰기는 잘 되는데 한 사람 화면에 남의 말이 안 들어오고 다른 화면에는 그 사람이 '접속 끊김'으로 뜬 일
const { chromium } = require('playwright'); const { open, ok, done, baseData, V } = require('./harness.js');
(async () => {
  const b = await chromium.launch();
  const S = { polls: 0, hang: false, dataHang: false, lines: [] };
  const never = () => new Promise(() => {});
  const handle = (a) => {
    if (a === 'poll') {
      S.polls++;
      if (S.hang) { S.hang = false; return never(); }                     // 이번 한 번은 답이 오지 않는다
      return { ok: true, v: Object.assign({}, V, { total: S.lines.length, sumVer: String(S.polls > 3 ? 2 : 1) }), lines: S.lines.slice(), presence: [], from: 0 };
    }
    if (a === 'data') { if (S.dataHang) return never(); return baseData(); }
    return null;
  };
  const { p, errs } = await open(b, { handle });
  await p.waitForTimeout(2500);
  // ① 자료 받기가 끝없이 늦어도(요약 버전이 바뀌어 data를 다시 부름) 새 말은 계속 들어온다
  S.dataHang = true;
  S.lines.push({ id: 1, time: '2026-11-27 20:00:01', session: '1', name: '영희', text: '첫 번째 말', uid: 'u1' });
  await p.waitForFunction(() => /첫 번째 말/.test(document.getElementById('log').textContent), null, { timeout: 15000 }).catch(() => {});
  S.lines.push({ id: 2, time: '2026-11-27 20:00:09', session: '1', name: '영희', text: '두 번째 말', uid: 'u2' });
  const got2 = await p.waitForFunction(() => /두 번째 말/.test(document.getElementById('log').textContent), null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok('자료(data) 받기가 멈춰 있어도 새 말 확인은 계속 돈다', got2);
  S.dataHang = false;
  // ② 새 말 확인 응답 하나가 오지 않아도 20초 뒤 끊고 다시 묻는다
  S.hang = true; const before = S.polls;
  await p.waitForTimeout(6000);
  S.lines.push({ id: 3, time: '2026-11-27 20:00:20', session: '1', name: '민수', text: '멈춘 뒤의 말', uid: 'u3' });
  const got3 = await p.waitForFunction(() => /멈춘 뒤의 말/.test(document.getElementById('log').textContent), null, { timeout: 40000 }).then(() => true).catch(() => false);
  ok('응답이 멈춘 요청은 끊고 다시 물어서 남의 말이 들어온다', got3 && S.polls > before + 1, 'polls ' + before + '→' + S.polls);
  ok('다시 이어지면 "연결됨"', await p.evaluate(() => /연결됨/.test(document.getElementById('netPill').textContent)));
  // ③ 받은 답을 그리다 오류가 나도 연결 끊김으로 세지 않고 계속 돈다
  await p.evaluate(() => { const o = window.renderWho; window.__rw = 0; window.renderWho = renderWho = (l) => { if (window.__rw++ < 1) throw new Error('그리기 오류 흉내'); return o(l); }; });
  S.lines.push({ id: 4, time: '2026-11-27 20:00:30', session: '1', name: '민수', text: '그리기 오류 뒤의 말', uid: 'u4' });
  await p.waitForTimeout(500);
  S.lines.push({ id: 5, time: '2026-11-27 20:00:40', session: '1', name: '민수', text: '다섯 번째 말', uid: 'u5' });
  const got5 = await p.waitForFunction(() => /다섯 번째 말/.test(document.getElementById('log').textContent), null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok('화면 그리기 오류가 나도 새 말 확인은 계속 돈다', got5 && await p.evaluate(() => !/끊김/.test(document.getElementById('netPill').textContent)));
  ok('새 말 확인 고리는 하나만 돈다 (겹쳐 돌지 않음)', await (async () => { const a = S.polls; await p.waitForTimeout(9000); const d = S.polls - a; return d >= 1 && d <= 3; })(), 'polls/9s');
  ok('페이지 오류 없음', !errs.length, errs.join(' | '));
  await b.close(); done();
})();
