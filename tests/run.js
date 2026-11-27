/* 가짜 Apps Script로 엔진(Code.gs) 시험을 모두 돌린다. 사용: node tests/run.js  (git 기록이 있어야 예전 판 시험이 돈다)
 * 실제 구글·Claude·Deepgram은 부르지 않는다. 가짜 AI는 받은 대화의 #번호를 요약에 그대로 적어서 빠진 줄을 셀 수 있게 한다. */
const cp = require('child_process'), path = require('path');
const tests = ['t_items', 't_flow', 't_stuck', 't_hosted', 't_lock', 't_tickall', 't_rollback', 't_session', 't_next', 't_next2', 't_next3', 't_myrec', 't_archive', 't_radar', 't_compat', 't_tools', 't_quality'];
let bad = 0;
for (const t of tests) {
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, t + '.js')], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const sum = (out.match(/합계: PASS (\d+) \/ FAIL (\d+)/) || []);
  const failN = r.status !== 0 ? (Number(sum[2]) || 1) : 0; bad += failN;
  console.log('### ' + t + ' (' + (Date.now() - t0) + 'ms) ' + (sum[0] || '오류'));
  if (process.argv.includes('-v') || failN) console.log(out);
}
console.log(bad ? '\n실패 ' + bad + '건' : '\n모두 통과');
process.exit(bad ? 1 : 0);
