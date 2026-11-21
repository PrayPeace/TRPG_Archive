// 5. 업데이트 → 예전 판으로 되돌리기 → 다시 새 판: 그 사이 받은 발언이 남는지
const { makeStore, exec, room, run, post, ok, done, oldCode, CODE } = require('./lib.js');
const NEW = CODE, OLD = oldCode('713e705');     // 11-21.19
const A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const st = makeStore();
const L = (p, n, extra) => Array.from({ length: n }, (_, i) => ({ uid: p + i, name: '철수', session: '1', t: new Date().toISOString(), text: (extra || '') + p + ' 발언 ' + i }));
// 예전 판(.19)으로 쓰던 방
room(st, A, 'pwA'); // 새 판 setup도 예전 판과 같은 시트 구조
post(exec(st, A, { code: OLD }), { action: 'lines', pw: 'pwA', items: L('old', 50) });
// 새 판으로 업데이트 후 받은 발언 (긴 말 1개 포함)
post(exec(st, A, { code: NEW }), { action: 'lines', pw: 'pwA', items: L('new', 40).concat([{ uid: 'long1', name: '영희', session: '1', t: new Date().toISOString(), text: 'ㄱ'.repeat(85000) }]) });
try { run(exec(st, A, { code: NEW }), 'processNow(true)'); } catch (e) {}
post(exec(st, A, { code: NEW }), { action: 'ping', pw: 'pwA' });       // 기기 토큰(ptok)도 생김
// 문제가 생겨 예전 판으로 되돌림
const co = exec(st, A, { code: OLD });
const rowsOld = run(co, 'allLineRows()');
ok('되돌린 판에서 새 판이 받은 발언(40줄) 그대로 보임', rowsOld.filter(l => /^new\d+$/.test(l.uid)).length === 40);
ok('긴 말은 예전 판에서도 글자 하나 안 잃음 (조각으로 보임)', rowsOld.filter(l => /^long1/.test(l.uid)).reduce((n, l) => n + l.text.length, 0) === 85000, '조각 ' + rowsOld.filter(l => /^long1/.test(l.uid)).length + '개');
const rb = post(exec(st, A, { code: OLD }), { action: 'lines', pw: 'pwA', items: L('back', 20) });
ok('되돌린 판에서도 계속 저장', rb.ok && rb.saved.length === 20);
const pollOld = run(exec(st, A, { code: OLD }), 'poll(0)'); ok('되돌린 판 poll 정상', pollOld.ok);
try { run(exec(st, A, { code: OLD }), 'processNow(true)'); } catch (e) { console.log('예전 판 요약 오류', e.message); }
// 다시 새 판
const cn = exec(st, A, { code: NEW });
const all = run(cn, 'allLineRows()');
const cnt = p => all.filter(l => new RegExp('^' + p + '\\d+$').test(l.uid)).length;
ok('다시 새 판: old 50 + new 40 + back 20 + 긴 말 1 = 111줄', all.length === 111 && cnt('old') === 50 && cnt('new') === 40 && cnt('back') === 20, '읽힌 ' + all.length + '줄');
ok('긴 말 원문 그대로', (all.find(l => l.uid === 'long1') || {}).text === 'ㄱ'.repeat(85000));
const uids = all.map(l => l.uid); ok('중복 없음', uids.length === new Set(uids).size);
try { run(exec(st, A, { code: NEW }), 'processNow(true)'); } catch (e) {}
ok('요약이 끝까지 따라잡음', Number(run(exec(st, A, { code: NEW }), "getConf('processedId')")) === run(exec(st, A, { code: NEW }), 'totalLines()'));
done();
