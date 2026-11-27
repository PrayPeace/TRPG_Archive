// 누적 줄거리: 길어지면 줄여 쓰기가 실제로 돌고(답 길이 한도 넉넉히), 줄이기 전 글을 storyBak에 남기고, 실패하면 storyFail에 남기는지.
// 11-27 질긴 결속 세션 2에서 줄거리가 끝없이 길어진 일 (줄여 쓰기 답이 한도 2600에 잘려 매번 실패, 기록도 안 남음)
const { makeStore, room, exec, run, post, ok, done } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const st = makeStore(); room(st, A, 'pwA'); const ex = () => exec(st, A);
run(ex(), "setConf('keeperName','키퍼')");
const base = Date.parse('2026-11-27T10:00:00Z'); let n = 0;
const say = k => post(ex(), { action: 'lines', pw: 'pwA', items: Array.from({ length: k }, () => { n++; return { uid: 'S' + n, name: n % 2 ? '키퍼' : '철수', session: '1', t: new Date(base + n * 9000).toISOString(), text: '저택으로 간다 ' + n }; }) });
// 지어낸 긴 줄거리 (7,000자 넘게)
const long = '【세션 1】\n' + Array.from({ length: 300 }, (_, i) => '일행은 저택 근처에서 ' + i + '번째 일을 겪었다고 마스터가 밝혔다.').join('\n');
run(ex(), 'withLock(20000, () => storyWrite(' + JSON.stringify(long) + ', []))');
let compactMax = 0, sawAdd = '';
st.aiReply = (sys, text) => {
  if (/줄거리를 줄여 다시 쓴다/.test(sys)) return JSON.stringify({ story: '일행은 저택 서재에서 찢어진 일기를 찾았다. 벽난로 뒤에는 헐거운 벽돌이 있었고, 지하실에서 쇠사슬 소리가 들렸다. 일행은 벽돌부터 빼 보기로 했고, 지하실은 손전등을 챙긴 다음에 내려가기로 미뤄 두었다.' });
  if (/기록 담당이다/.test(sys) && /storyAdd/.test(text)) { sawAdd = text; return JSON.stringify({ summary: '【저택】\n- 10:00 저택으로 감 (#1)', storyAdd: '일행은 &#39;저택&#39;으로 갔다.', notes: null }); }
  return '';
};
say(6);
for (let k = 0; k < 4; k++) run(ex(), 'processNow(true)');
const story = run(ex(), 'storyText()'), bak = JSON.parse(run(ex(), "getConfLong('storyBak') || '{}'"));
ok('긴 줄거리를 줄여 씀 (세션 구분 줄은 그대로)', story.length < 300 && /^【세션 1】\n일행은 저택 서재에서 찢어진 일기/.test(story), story.slice(0, 120));
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
// 지난 세션은 글자 그대로, 지금 세션 부분만 줄인다 (대장: 세션1의 사건은 그대로 두고)
const s1 = '【세션 1】\n세션 일의 줄거리. 지난 세션은 이미 잘 정리돼 있다. ' + '지난 일 '.repeat(400);
const s2 = '\n\n【세션 2】\n' + Array.from({ length: 300 }, (_, i) => '이번 세션 ' + i + '번째 일이 있었다고 마스터가 밝혔다.').join('\n');
st.aiFail = null; let sentText = '';
st.aiReply = (sys, text) => { if (/줄거리를 줄여 다시 쓴다/.test(sys)) { sentText = text; return JSON.stringify({ story: '【세션 2】\n일행은 지하실로 내려가 쇠사슬에 묶인 주인을 찾았다. 집사는 도망쳤고, 일행은 경찰을 불러 저택을 넘긴 뒤 주인을 병원으로 옮겼다. 편지는 벽난로 뒤에서 찾았다. 일행은 다음 날 아침 병원에서 주인의 이야기를 듣기로 했다.' }); } return ''; };
run(ex(), 'withLock(20000, () => storyWrite(' + JSON.stringify(s1 + s2) + ', storyDoc().k))');
run(ex(), '(() => { const job = acquireJob("summary", 0); compactStory(job); releaseJob(job); })()');
const t3 = run(ex(), 'storyText()');
ok('지난 세션(세션 1) 부분은 글자 하나 안 바뀜', t3.indexOf(s1) === 0, t3.slice(0, 60));
ok('지금 세션(세션 2) 부분만 줄여 씀, 구분 줄 하나', /【세션 2】\n일행은 지하실로/.test(t3) && (t3.match(/【세션 2】/g) || []).length === 1 && !/번째 일이 있었다/.test(t3), t3.slice(-160));
ok('AI에는 지난 세션을 참고로만 주고 이번 세션만 다시 쓰라고 함', /지난 세션 줄거리 \(참고만/.test(sentText) && /이번 세션 【세션 2】 줄거리/.test(sentText));
// 지금 세션이 짧으면 지난 세션이 길어도 줄이지 않는다
const calls0 = st.aiCalls;
run(ex(), 'withLock(20000, () => storyWrite(' + JSON.stringify(s1 + '\n\n【세션 3】\n짧은 이야기.') + ', storyDoc().k))');
run(ex(), '(() => { const job = acquireJob("summary", 0); compactStory(job); releaseJob(job); })()');
ok('지금 세션이 짧으면 AI를 부르지 않고 그대로', st.aiCalls === calls0 && run(ex(), 'storyText()').indexOf(s1) === 0);
// 길이 상한 없음: 아주 길어져도 앞부분이 잘리지 않고, 시트 칸 한도(5만 자)를 넘으면 여러 칸에 나눠 담는다 (대장 "앞부분이 잘려나가는 방지로 그리고 상한은 일단 없애")
const big = '【세션 1】\n맨 앞 첫 문장.\n' + '옛 일 '.repeat(30000) + '\n\n【세션 2】\n' + '이번 일 '.repeat(2000);
run(ex(), 'withLock(20000, () => { storyWrite(' + JSON.stringify(big) + ', []); storyApply("kbig", { session: "2", storyAdd: "일행은 맨 끝 문장을 남겼다." }); })');
const tb = run(ex(), 'storyText()');
ok('10만 자가 넘어도 앞부분이 그대로 남고 뒤에 이어 붙음', tb.length > 100000 && tb.indexOf('【세션 1】\n맨 앞 첫 문장.') === 0 && /맨 끝 문장을 남겼다\.$/.test(tb), tb.length);
ok('시트 칸 하나에는 5만 자 넘게 넣지 않음 (여러 칸에 나눔)', run(ex(), "[getConf('story'), getConf('story#2'), getConf('story#3'), getConf('story#4')].every(v => v == null || v.length <= 50000) && !!getConf('story#3')"));
run(ex(), "withLock(20000, () => storyWrite('짧은 글', storyDoc().k))");
ok('다시 짧아지면 남은 칸을 비움', run(ex(), "storyText() === '짧은 글' && !getConf('story#2') && !getConf('story#3')"));
const sv = post(ex(), { action: 'storySave', pw: 'pwA', text: big });
ok('직접 고치기(storySave)도 길이 상한 없이 글자 그대로 저장', sv.ok && run(ex(), 'storyText()') === big, run(ex(), 'storyText().length'));
ok('정정 AI가 끊겨 짧아진 줄거리는 쓰지 않음', run(ex(), "!storyKeepsFront('【세션 1】\\n' + 'a'.repeat(1000) + '\\n【세션 2】\\nb', '【세션 2】\\nb') && storyKeepsFront('【세션 1】\\naaaa\\n【세션 2】\\nbbbb', '【세션 1】\\naaab\\n【세션 2】\\nbbbb')"));
done();
