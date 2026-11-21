/* 엔진 자동 배포에서 쓴다 (GitHub Actions).
 * 저장소의 Code.gs는 맨 위 네 줄(키·비밀번호)이 자리표시자다. 엔진에서 받아 온 지금 Code.gs의 그 네 줄을 그대로 옮겨 붙여서,
 * 실제 키를 저장소에 두지 않고도 엔진 코드를 새 판으로 바꾼다. 네 줄 중 하나라도 못 찾으면 아무것도 바꾸지 않고 멈춘다.
 * 사용: node tools/engine-merge.js <엔진에서 받은 폴더> <저장소 Code.gs>
 * 값은 화면에 찍지 않는다. */
const fs = require('fs'), path = require('path');
const KEYS = ['CLAUDE_KEY', 'DEEPGRAM_KEY', 'ROOM_PW', 'KEEPER_PW'];
const lineRe = k => new RegExp('^const ' + k + '\\s*=.*$', 'm');

function merge(engineSrc, repoSrc) {
  let out = repoSrc;
  for (const k of KEYS) {
    const e = engineSrc.match(lineRe(k)), r = repoSrc.match(lineRe(k));
    if (!e) throw new Error('엔진 코드에서 ' + k + ' 줄을 찾지 못했어요');
    if (!r) throw new Error('저장소 Code.gs에서 ' + k + ' 줄을 찾지 못했어요');
    out = out.replace(lineRe(k), () => e[0]);
  }
  if (!/const CODE_VER\s*=/.test(out)) throw new Error('CODE_VER 줄이 없어요');
  return out;
}
module.exports = { merge, KEYS };

if (require.main === module) {
  const [dir, repoFile] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter(f => /\.(gs|js)$/.test(f))
    .filter(f => /const CODE_VER\s*=/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (files.length !== 1) { console.error('엔진에서 Code.gs로 보이는 파일이 ' + files.length + '개예요 (1개여야 함): ' + files.join(', ')); process.exit(1); }
  const target = path.join(dir, files[0]);
  const engineSrc = fs.readFileSync(target, 'utf8');
  const before = (engineSrc.match(/const CODE_VER\s*=\s*'([^']*)'/) || [])[1] || '?';
  const merged = merge(engineSrc, fs.readFileSync(repoFile, 'utf8'));
  const after = (merged.match(/const CODE_VER\s*=\s*'([^']*)'/) || [])[1] || '?';
  fs.writeFileSync(target, merged);
  console.log('엔진 파일 ' + files[0] + ': ' + before + ' → ' + after + ' (키 네 줄은 엔진 값 그대로)');
}
