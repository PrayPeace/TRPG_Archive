/* 운영 전환·되돌리기에서 쓴다 (GitHub Actions).
 * 방 프로젝트의 appsscript.json에서 라이브러리 TRPG를 정한 버전에 고정한다 (개발 모드 끔).
 * 사용: node tools/pin-room.js <appsscript.json 경로> <버전 번호 | head>
 *   head: 다시 개발 모드(HEAD)로 — 시험 방용 */
const fs = require('fs');
function pin(manifest, ver) {
  const libs = (manifest.dependencies && manifest.dependencies.libraries) || [];
  const lib = libs.find(l => l.userSymbol === 'TRPG');
  if (!lib) throw new Error('이 방 프로젝트에 라이브러리 TRPG가 없어요');
  const before = lib.developmentMode ? 'head' : String(lib.version);      // 바꾸기 전 상태 (배포가 중간에 실패하면 이 값으로 되돌린다)
  if (ver === 'head') { lib.developmentMode = true; }
  else { if (!/^\d+$/.test(String(ver))) throw new Error('버전 번호가 이상해요: ' + ver); lib.version = String(ver); lib.developmentMode = false; }
  return { manifest, before, lib };
}
// 지금 상태만 본다 (바꾸지 않음): { dev: 개발 모드(HEAD)인지, version, libraryId: 어느 엔진 스크립트를 가리키는지 }
function libState(manifest) {
  const lib = ((manifest.dependencies && manifest.dependencies.libraries) || []).find(l => l.userSymbol === 'TRPG');
  return lib ? { dev: !!lib.developmentMode, version: String(lib.version || ''), libraryId: String(lib.libraryId || '') } : null;
}
module.exports = { pin, libState };
if (require.main === module) {
  const [file, ver] = process.argv.slice(2);
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = pin(m, ver);
  fs.writeFileSync(file, JSON.stringify(r.manifest, null, 2));
  console.log('TRPG 라이브러리 → ' + (ver === 'head' ? 'HEAD(개발 모드)' : '버전 ' + ver));
}
