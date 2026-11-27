// 로비 "📚 서고 연결": 로비와 모든 방에 차례로 마스터 로그인 → kArchiveSet, 실패한 방은 이유와 함께 표시
const { chromium } = require('playwright'); const { open, ok, done } = require('./harness.js');
(async () => {
  const b = await chromium.launch();
  const calls = [];
  const handle = (a, j, url) => {
    if (a === 'hubLogin' || a === 'kArchiveSet' || a === 'klogout') calls.push({ a, url, j });
    if (a === 'hubLogin') return /ROOMbad/.test(url) ? { ok: false, error: '비밀번호가 달라요' } : { ok: true, kt: 'KT-' + url.slice(-12) };
    if (a === 'kArchiveSet') return { ok: true, linked: true };
    if (a === 'klogout') return { ok: true };
    return null;
  };
  const { p, errs } = await open(b, { handle });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    L.hub = 'https://script.google.com/macros/s/ROOMlobby1/exec';
    L.rooms = [{ name: '질긴 결속', rule: 'coc', url: 'https://script.google.com/macros/s/ROOMgood22/exec' }, { name: '대기 방', rule: 'coc', url: '' }, { name: '옛 방', rule: 'coc', url: 'https://script.google.com/macros/s/ROOMbad333/exec' }];
    seogoForm();
  });
  await p.waitForTimeout(300);
  const inputs = p.locator('#lSheet input');
  const n = await inputs.count();
  ok('연결 코드·주인 이름·마스터 비밀번호 칸 (주인 이름은 내 이름으로 채워 둠)', n >= 3 && await inputs.nth(1).inputValue() === '대장', String(n));
  await p.evaluate(() => { const i = document.querySelectorAll('#lSheet input'); i[0].value = 'https://script.google.com/macros/s/AKfyX/exec#' + 'k'.repeat(32); i[2].value = 'kpw-1234'; [...document.querySelectorAll('#lSheet button')].find(x => x.textContent === '모든 방에 연결').click(); });
  await p.waitForTimeout(1500);
  const sets = calls.filter(c => c.a === 'kArchiveSet');
  ok('로비와 주소 있는 방마다 마스터 로그인 뒤 연결 (주소 없는 방은 건너뜀)', calls.filter(c => c.a === 'hubLogin').length === 3 && sets.length === 2 && sets.every(c => c.j.kt && c.j.code.endsWith('#' + 'k'.repeat(32)) && c.j.me === '대장'), JSON.stringify(calls.map(c => c.a + ' ' + c.url.slice(-16))));
  const txt = await p.evaluate(() => $('lSheet').textContent);
  ok('결과: 된 방은 ✔, 안 된 방은 ✖ 이유', /✔ 로비 방/.test(txt) && /✔ 질긴 결속/.test(txt) && /✖ 옛 방: 비밀번호가 달라요/.test(txt) && /1곳은 연결하지 못했어요/.test(txt));
  ok('화면 오류 없음', errs.length === 0, errs.join(' / '));
  await b.close(); done();
})();
