// 새 화면(GitHub Pages)이 먼저 올라가고 서버(엔진)는 아직 예전 판일 때, 그리고 되돌린 뒤: 새 화면이 보내는 요청을 예전 서버가 받아도 기록이 깨지지 않는지
// + 늦게 복구된 말이 말한 때의 세션에 들어가는지 (새 서버)
const { makeStore, exec, room, run, post, ok, done, oldCode } = require('./lib.js');
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const names = ['키퍼', '철수', '영희'];
let OLD = null; try { OLD = oldCode('a857de4'); } catch (e) { OLD = null; }      // 2026-11-21.24 (git 기록이 있을 때만)
const NEXT = /다음에 해 볼 만한 것/;
const reply = tag => (sys) => NEXT.test(sys) ? JSON.stringify({ now: { scene: tag, just: tag, agreed: '', held: '' }, items: [{ kind: '행동', title: tag + ' 할 일', why: '', prio: 1, src: [], guess: false }] }) : (/진행 현황판/.test(sys) ? JSON.stringify({ found: [], missing: [], hints: [], warnings: [] }) : '');
function scenario(code, label) {
  const st = makeStore(), ex = () => exec(st, A, code ? { code } : {});
  makeRoom(st, code);
  let n = 0; const base = Date.now() - 600000;
  const say = (texts, sess, extra) => post(ex(), { action: 'lines', pw: 'pwA', items: texts.map(t => { n++; return Object.assign({ uid: label + n, name: names[n % 3], session: sess || '1', rv: String(run(ex(), "getConf('resetVer')||'0'")), t: new Date(base + n * 5000).toISOString(), text: t }, extra || {}); }) });
  return { st, ex, say, count: () => n };
}
function makeRoom(st, code) { const { makeBook } = require('./fakegas.js'); makeBook(st, A, '🎲TRPG Archive · CoC 방AAA'); run(exec(st, A, code ? { code } : {}), "setup('pwA')"); run(exec(st, A, code ? { code } : {}), "setConf('keeperName','키퍼')"); }

if (!OLD) { console.log('SKIP 예전 판(.24)을 git 기록에서 꺼내지 못해 예전 서버 호환 시험 8개는 돌리지 않음 (미실행, 통과로 세지 않음)'); }
else {
  const o = scenario(OLD, 'O');
  // 새 화면이 보내는 발언: "(확정 전)" 표시, 말한 때의 시각(지금보다 과거)
  const r1 = o.say(['세션 1 현관에서 이야기한다', '지하실 문을 열어 본다 (확정 전)', '※ 받아쓰기 끊김 약 2분 0초 (10:00:00~10:02:00, 연결 끊김). 이 사이 철수의 말은 기록되지 않았을 수 있어요']);
  ok('예전 서버(.24)가 새 화면의 발언(확정 전 표시 포함)을 그대로 저장', r1.ok && r1.saved.length === 3 && run(o.ex(), 'totalLines()') === 3);
  const v = JSON.parse(run(o.ex(), "JSON.stringify(doGet({parameter:{action:'ver'}}))"));
  ok('예전 서버의 ?action=ver: 판 번호만 답함 (tick 없음) → 새 화면·배포 도구가 없는 항목으로 처리', v.ok && v.ver === '2026-11-21.24' && v.tick === undefined, JSON.stringify(v));
  o.say(Array.from({ length: 8 }, (_, i) => '서재에서 책장을 본다 ' + i));
  o.st.aiReply = reply('세션1');
  const a1 = post(o.ex(), { action: 'nextSteps', pw: 'pwA' });
  ok('예전 서버의 추천: sess가 없어도 key 셋째 칸이 세션 (새 화면이 여기서 세션을 읽는다)', a1.ok && a1.next && a1.next.sess === undefined && String(a1.next.key).split('.')[2] === '1' && String(a1.next.key).split('.')[3] === String(run(o.ex(), "getConf('resetVer')||'0'")), a1.next && a1.next.key);
  // 4차 검토에서 재현된 결함이 예전 판에 실제로 있는지 (이 시험이 진짜 문제를 보고 있는지 확인)
  run(o.ex(), 'newSession()'); o.say(Array.from({ length: 6 }, (_, i) => '세션 2 항구 ' + i), '2');
  o.st.aiReply = reply('세션2');
  const a2 = post(o.ex(), { action: 'nextSteps', pw: 'pwA', force: true });
  ok('(재현) 예전 서버(.24)는 세션 전환 직후 force에 세션 1 추천을 돌려줌 → 새 화면이 key로 걸러 보이지 않게 한다', a2.ok && a2.wait === true && a2.next && String(a2.next.key).split('.')[2] === '1' && /세션1/.test(a2.next.items[0].title), JSON.stringify({ wait: a2.wait, fresh: a2.fresh, key: a2.next && a2.next.key }));
  // 새 화면은 현황 갱신에 scene을 함께 보낸다: 예전 서버는 모르는 값을 무시
  run(o.ex(), "kbWrite(Object.assign(kbEmpty(), { truth: '진상', clues: [{ id: 'k1', text: '단서 하나' }] }))");
  const kb = JSON.parse(run(o.ex(), "JSON.stringify(kBoard(false, '서재'))"));
  ok('예전 서버의 현황 갱신: 새 화면이 보낸 scene을 무시하고 정상 동작 (basis에 scene 없음 → 화면은 "장면 기록 없음")', kb.ok && kb.board && kb.board.basis && kb.board.basis.scene === undefined);
  // 예전 서버에서 쌓은 기록을 새 서버로 열어도 그대로 (되돌렸다가 다시 올리는 경우)
  const before = run(o.ex(), "JSON.stringify(history(0, 1000).lines.map(l => [l.id, l.uid, l.session, l.name, l.time, l.text]))");
  const stNew = exec(o.st, A);
  const after = run(stNew, "JSON.stringify(history(0, 1000).lines.map(l => [l.id, l.uid, l.session, l.name, l.time, l.text]))");
  ok('예전 판 → 새 판: 모든 발언의 번호·발언ID·회차·이름·시각·원문이 같음', before === after && JSON.parse(after).length === o.count(), JSON.parse(after).length + '줄');
  o.st.aiReply = reply('세션2');
  const a3 = post(exec(o.st, A), { action: 'nextSteps', pw: 'pwA', force: true });
  ok('새 판으로 올리면 예전 판이 남긴 세션 1 추천을 돌려주지 않음 (sess가 없는 추천은 key로 판단)', a3.ok && !a3.wait && a3.next && a3.next.sess === '2' && /세션2/.test(a3.next.items[0].title), JSON.stringify({ wait: a3.wait, sess: a3.next && a3.next.sess }));
  // 새 판 → 다시 예전 판(되돌리기): 새 판이 쓴 추천(sess·rv·basis 새 항목)을 예전 서버가 읽어도 오류 없음
  let a4 = null, err = ''; try { a4 = post(o.ex(), { action: 'nextSteps', pw: 'pwA' }); } catch (e) { err = String(e.message || e); }
  ok('되돌린 예전 서버가 새 판이 저장한 추천을 읽어도 오류 없음', !err && a4 && a4.ok && a4.next && a4.next.items.length === 1, err);
}

// 새 서버: 늦게 복구된 말(끊긴 동안 말한 것)이 새 세션에 들어가지 않는다
{
  const s = scenario(null, 'N');
  s.say(['세션 1에서 한 말']);
  const before = Date.now() - 120000;                                        // 세션 2가 시작되기 전에 말한 시각
  run(s.ex(), 'newSession()');
  const late = post(s.ex(), { action: 'lines', pw: 'pwA', items: [
    { uid: 'late1', name: '철수', session: '1', rv: String(run(s.ex(), "getConf('resetVer')||'0'")), t: new Date(before).toISOString(), text: '끊긴 동안(세션 1) 한 말 (확정 전)' },
    { uid: 'now1', name: '철수', session: '1', rv: String(run(s.ex(), "getConf('resetVer')||'0'")), t: new Date(Date.now() + 1000).toISOString(), text: '세션이 넘어간 뒤에 한 말 (화면이 아직 세션 1로 알고 있음)' }] });
  const got = JSON.parse(run(s.ex(), "JSON.stringify(history(0, 100).lines.map(l => [l.uid, String(l.session)]))"));
  const m = {}; got.forEach(x => { m[x[0]] = x[1]; });
  ok('세션 2가 시작되기 전에 말한 것은 늦게 도착해도 세션 1로 저장', late.ok && late.saved.length === 2 && m.late1 === '1', JSON.stringify(got));
  ok('세션 2가 시작된 뒤에 말한 것은 화면이 세션 1로 보냈어도 세션 2로 저장', m.now1 === '2');
  // 초기화 전에 말한 것은 초기화 뒤에 도착해도 저장하지 않는다
  const rv0 = String(run(s.ex(), "getConf('resetVer')||'0'"));
  run(s.ex(), "withLock(20000, () => setConf('resetVer', '" + (Number(rv0) + 1) + "'))");
  const drop = post(s.ex(), { action: 'lines', pw: 'pwA', items: [{ uid: 'old-rv', name: '철수', session: '1', rv: rv0, t: new Date(before).toISOString(), text: '초기화 전에 한 말' }] });
  ok('초기화 전에 말한 것은 초기화 뒤에 도착해도 새 기록에 넣지 않음', drop.ok && (drop.dropped || []).includes('old-rv') && !(drop.saved || []).length);
}
done();
