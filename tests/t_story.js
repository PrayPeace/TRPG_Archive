// 누적 줄거리: 길어지면 줄여 쓰기가 실제로 돌고(답 길이 한도 넉넉히), 줄이기 전 글을 storyBak에 남기고, 실패하면 storyFail에 남기는지.
// 11-27 질긴 결속 세션 2에서 줄거리가 끝없이 길어진 일 (줄여 쓰기 답이 한도 2600에 잘려 매번 실패, 기록도 안 남음)
const { makeStore, room, exec, run, post, ok, done } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const st = makeStore(); room(st, A, 'pwA'); const ex = () => exec(st, A);
run(ex(), "setConf('keeperName','키퍼')");
const base = Date.parse('2026-11-27T10:00:00Z'); let n = 0;
const say = k => post(ex(), { action: 'lines', pw: 'pwA', items: Array.from({ length: k }, () => { n++; return { uid: 'S' + n, name: n % 2 ? '키퍼' : '철수', session: '1', t: new Date(base + n * 9000).toISOString(), text: '저택으로 간다 ' + n }; }) });
// 지어낸 긴 줄거리 (7,000자 넘게)
const long = '【세션 1】\n' + Array.from({ length: 120 }, (_, i) => '일행은 저택 근처에서 ' + i + '번째 일을 겪었다고 마스터가 밝혔다.').join('\n');
run(ex(), 'withLock(20000, () => storyWrite(' + JSON.stringify(long) + ', []))');
let compactMax = 0, sawAdd = '';
st.aiReply = (sys, text) => {
  if (/줄거리를 줄여 다시 쓴다/.test(sys)) return JSON.stringify({ story: '【세션 1】\n일행은 저택 서재에서 찢어진 일기를 찾았다. 벽난로 뒤에는 헐거운 벽돌이 있었고, 지하실에서 쇠사슬 소리가 들렸다. 일행은 벽돌부터 빼 보기로 했고, 지하실은 손전등을 챙긴 다음에 내려가기로 미뤄 두었다.' });
  if (/기록 담당이다/.test(sys) && /storyAdd/.test(text)) { sawAdd = text; return JSON.stringify({ summary: '【저택】\n- 10:00 저택으로 감 (#1)', storyAdd: '일행은 &#39;저택&#39;으로 갔다.', notes: null }); }
  return '';
};
say(6);
for (let k = 0; k < 4; k++) run(ex(), 'processNow(true)');
const story = run(ex(), 'storyText()'), bak = JSON.parse(run(ex(), "getConf('storyBak') || '{}'"));
ok('긴 줄거리를 줄여 씀', story.length < 300 && /찢어진 일기/.test(story), story.slice(0, 120));
ok('줄이기 전 글을 storyBak에 남김', (bak.t || '').indexOf('119번째 일') >= 0, String(bak.t || '').length);
ok('요약 지시: 줄거리에는 큰 일만 1~2문장, 판정·마스터 말 전달은 쓰지 말 것', /1~2문장\(150자 이내\)/.test(sawAdd) && /마스터는 ~라고 밝혔다/.test(sawAdd));
// 줄여 쓰기 답 길이 한도 (예전 2600 → 8000)
ok('줄여 쓰기 답 길이 한도가 넉넉함', /compactStory[^]*?, 8000\)\)\)/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8')));
// 줄거리에 덧붙인 글의 &#39; 같은 표시는 글자로 바꿔 넣음 (이번 요약의 storyAdd)
// 실패하면 기록이 남고 줄거리는 그대로
run(ex(), 'withLock(20000, () => storyWrite(' + JSON.stringify(long) + ', storyDoc().k))');
st.aiFail = (sys) => /줄거리를 줄여 다시 쓴다/.test(sys) ? 'AI 답이 정해 둔 길이를 넘어 중간에 끊겼어요' : '';
say(6);
for (let k = 0; k < 4; k++) run(ex(), 'processNow(true)');
const fail = JSON.parse(run(ex(), "getConf('storyFail') || 'null'"));
ok('줄여 쓰기가 실패하면 storyFail에 이유를 남기고 줄거리는 그대로', fail && /끊겼/.test(fail.error) && run(ex(), 'storyText()').indexOf('119번째 일') >= 0, JSON.stringify(fail));
run(ex(), "withLock(20000, () => { storyWrite('【세션 1】\\n짧은 줄거리', []); storyApply('kx', { session: '1', storyAdd: '일행은 &#39;서재&#39;에서 &#34;쿵&#34; 소리를 들었다.' }); })");
ok('덧붙인 글의 &#39; &#34; 표시는 따옴표 글자로 바꿔 넣음', /'서재'에서 "쿵" 소리/.test(run(ex(), 'storyText()')), run(ex(), 'storyText()'));
done();
