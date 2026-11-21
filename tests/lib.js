const { makeStore, makeBook, execCtx } = require('./fakegas.js');
const path = require('path'), os = require('os'), cp = require('child_process'), fs = require('fs');
const CODE = process.env.CODE || path.join(__dirname, '..', 'Code.gs');
// 예전 판 Code.gs를 git 기록에서 꺼낸다 (되돌리기·구버전 방 시험용)
function oldCode(sha) { const f = path.join(os.tmpdir(), 'trpg_Code_' + sha + '.gs'); if (!fs.existsSync(f)) fs.writeFileSync(f, cp.execSync('git show ' + sha + ':Code.gs', { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 26 })); return f; }
const vm = require('vm');
// 가짜 Claude: 요약 → 대화에 나온 #번호를 summary에 그대로 적는다(빠짐 확인용). 정리 → 줄마다 단서 하나.
const AI_MOCK = `
var __calls = 0;
claude = function(system, content, maxTok, model){
  __calls++; __store.aiCalls = (__store.aiCalls||0) + 1;
  const text = Array.isArray(content) ? content.map(c => typeof c === 'string' ? c : (c.text||'')).join('\\n') : String(content);
  if (__store.aiDelay && __store.vclock) { const ms = __store.aiDelay(ssId(), text) || 0; if (__store.onAi) __store.onAi(ssId(), ms); __store.vclock.t += ms; }
  const f = __store.aiFail && __store.aiFail(system, text); if (f) { const e = new Error(f); if (/잘렸/.test(f)) e.kind = 'truncated'; throw e; }
  __store.lastAi = { system: String(system), text };
  if (__store.aiReply) { const rp = __store.aiReply(String(system), text); if (rp) return rp; }
  const ids = (text.match(/^#(\\d+) [^:\\n]{1,40}: /gm) || []).map(x => x.slice(1).split(' ')[0]);     // 보낸 대화 줄(#번호 이름: 말)만 센다 (앞 요약 같은 참고 글의 #번호는 빼고)
  if (text.indexOf('{"notes":{"places":[]') >= 0) return JSON.stringify({ notes: { places: [], npcs: [], pcs: [], handouts: [], clues: ids.slice(0, 2).map(i => ({ id: 'c' + i, text: '단서 #' + i, status: '미해결', kind: '확인', src: [] })) } });
  return JSON.stringify({ summary: '- 요약 ' + ids.map(i => '#' + i).join(' '), storyAdd: '이야기 ' + ids.length, notes: null });
};
`;
function room(store, id, pw){
  makeBook(store, id, '🎲TRPG Archive · CoC 방' + id.slice(-3));
  const c = exec(store, id); vm.runInContext(`setup(${JSON.stringify(pw)})`, c); return c;
}
function exec(store, active, opts){ opts = opts || {}; const ctx = execCtx(store, opts.code || CODE, { active, serviceUrl: opts.serviceUrl, after: AI_MOCK }); ctx.__store = store; return ctx; }
const run = (c, s) => vm.runInContext(s, c);
const post = (c, b, q) => run(c, `doPost({parameter:${JSON.stringify(q||{})},postData:{contents:${JSON.stringify(JSON.stringify(b))}}})`);
let pass = 0, fail = 0; const ok = (l, v, extra) => { v ? pass++ : fail++; console.log((v ? 'PASS ' : 'FAIL ') + l + (extra ? '  ' + extra : '')); };
const done = () => { console.log(`\n합계: PASS ${pass} / FAIL ${fail}`); if (fail) process.exitCode = 1; };
module.exports = { makeStore, makeBook, exec, room, run, post, ok, done, oldCode, CODE };
