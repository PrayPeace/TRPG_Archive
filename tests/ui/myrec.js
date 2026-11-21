// 📜 세션 기록(내 스타일) 내보내기 화면: 서버가 준 기록으로 한글·텍스트 파일을 만들고, 날짜 줄·아카이브 메모를 붙이는지
const { chromium } = require('playwright'); const { open, ok, done, baseData } = require('./harness.js');
const fs = require('fs'), zlib = require('zlib');
const rec = s => ({ ok: true, reused: s === '2', sess: s, date: '2026-11-2' + s, title: 'CoC 안개 낀 등대', me: '대장', kp: 'KP: 달토끼 / PL: 소금빵', pcLine: '엘리(소금빵), 토머스(나)',
  pcs: ['엘리(소금빵): 기자.', '토머스(나): 의사.'], setting: '1920s 해안',
  glance: { one: '등대 조사 시작', ending: '진행 중.', mine: '토머스(나): 자물쇠를 땀.', keys: '[젖은 발자국] → [일지]' },
  body: '등대지기 실종 소식.\n-1924년 9월 3일 수요일-\n-오후 4시-\n-[선착장]-\n-노인이 맞이함. 📌\n--관찰력[성공]: [젖은 발자국]',
  ending: '진행 중. 다음 회차에 꼭대기로.', epilogue: [], memo: { npcs: ['어부 노인: 맞이함.'], places: ['선착장', '등대 1층'], clues: ['[미해결] 젖은 발자국'], mine: ['자물쇠를 땀.'], check: ['노인 이름이 없음.'],
    quotes: [{ who: '소금빵', text: '저 불 꺼진 거 우리 탓 아니죠?' }], dice: ['엘리(소금빵): 받은 피해 2'], relations: ['토머스 ↔ 노인: 경계 → 믿음'], carry: ['다음 회차로: 꼭대기'] },
  play: { start: '19:05', end: '22:47', endDate: '2026-11-2' + s, mins: 222 },
  bms: [{ text: '- 노인이 맞이함', by: '소금빵' }] });
// zip(저장 방식) 안의 파일 하나를 꺼낸다
function unzip(buf, name) { let i = 0; while (i < buf.length - 30 && buf.readUInt32LE(i) === 0x04034b50) { const m = buf.readUInt16LE(i + 8), cs = buf.readUInt32LE(i + 18), nl = buf.readUInt16LE(i + 26), xl = buf.readUInt16LE(i + 28); const n = buf.slice(i + 30, i + 30 + nl).toString(); const d = buf.slice(i + 30 + nl + xl, i + 30 + nl + xl + cs); if (n === name) return (m === 8 ? zlib.inflateRawSync(d) : d).toString(); i += 30 + nl + xl + cs; } return ''; }
(async () => {
  const b = await chromium.launch();
  const asked = [];
  const handle = (a, j) => { if (a === 'myRecord') { asked.push(j); return j.session === '3' ? { ok: true, empty: true } : rec(j.session); } if (a === 'data') return Object.assign(baseData(), { keeperName: '달토끼', characters: [{ name: '엘리', player: '소금빵' }, { name: '토머스', player: '대장' }, { name: '달토끼 NPC', player: '달토끼' }] }); if (a === 'sessions') return { ok: true, sessions: [{ session: '1', count: 10 }, { session: '2', count: 10 }, { session: '3', count: 0 }] }; return null; };
  const { p, errs } = await open(b, { handle });
  await p.waitForTimeout(1500);
  await p.evaluate(() => showTab('sum')); await p.waitForTimeout(200);
  await p.click('#exportBtn'); await p.waitForTimeout(400);
  await p.evaluate(() => { const o = window.saveBlob; window.__names = []; window.saveBlob = (b, n) => { window.__names.push(n); o(b, n); }; });
  await p.selectOption('#modalBody select', '1');
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#myRec_hwpx')]);
  const f1 = await d1.path(), sec = unzip(fs.readFileSync(f1), 'Contents/section0.xml');
  const paras = (sec.match(/<hp:p [^>]*>.*?<\/hp:p>/g) || []).map(x => ({ cp: (/charPrIDRef="(\d+)"/.exec(x) || [])[1], pp: (/paraPrIDRef="(\d+)"/.exec(x) || [])[1], t: ((x.match(/<hp:t>([^<]*)<\/hp:t>/g) || []).join('')).replace(/<\/?hp:t>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&') }));
  const t = paras.map(x => x.t), cp = l => (paras.find(x => x.t === l) || {}).cp, pp = l => (paras.find(x => x.t === l) || {}).pp;
  const head = unzip(fs.readFileSync(f1), 'Contents/header.xml');
  ok('한글 파일 머리말: 제목 → KP/PL(나는 뺌) → 캐릭터(나) 한 줄 → PC 줄 → 플레이(날짜·회차·배경) → ▣ 한눈에 4줄', t.slice(0, 11).join('|') === 'CoC 안개 낀 등대|KP: 달토끼 / PL: 소금빵|엘리(소금빵), 토머스(나)|엘리(소금빵): 기자.|토머스(나): 의사.|플레이: 2026-11-21 19:05~22:47 (3시간 42분) · 세션 1회차 · 1920s 해안|▣ 한눈에|한 줄: 등대 조사 시작|결말: 진행 중.|토머스(나): 자물쇠를 땀.|열쇠 단서: [젖은 발자국] → [일지]', JSON.stringify(t.slice(0, 11)));
  ok('본문 글자 모양: 이야기 날짜 줄은 큰 제목, 시각 줄은 작은 제목, 사건 줄은 본문(북마크 📌 그대로)', cp('-1924년 9월 3일 수요일-') === '8' && cp('-오후 4시-') === '6' && cp('-노인이 맞이함. 📌') === '0', JSON.stringify([cp('-1924년 9월 3일 수요일-'), cp('-오후 4시-'), cp('-노인이 맞이함. 📌')]));
  ok('장소 줄 -[선착장]-: 굵은 작은 제목 + 가운데 정렬 문단 모양(20번, 뼈대에 CENTER로 있음), 다른 줄은 양쪽 정렬(0번)', cp('-[선착장]-') === '6' && pp('-[선착장]-') === '20' && pp('-오후 4시-') === '0' && /<hh:paraPr id="20"[^>]*><hh:align horizontal="CENTER"/.test(head) && /paraProperties itemCnt="21"/.test(head), JSON.stringify([cp('-[선착장]-'), pp('-[선착장]-')]));
  ok('메모에 명대사·주사위·관계 변화·캠페인 이어 보기', t.includes('명대사') && t.includes('"저 불 꺼진 거 우리 탓 아니죠?" (소금빵)') && t.includes('엘리(소금빵): 받은 피해 2') && t.includes('관계 변화') && t.includes('토머스 ↔ 노인: 경계 → 믿음') && t.includes('캠페인 이어 보기') && t.includes('다음 회차로: 꼭대기'));
  ok('끝: 결말 줄 → 아카이브 메모(NPC, 장소, 단서, 북마크(누가), 내 PC가 한 일, 확인할 것)', t.includes('결말: 진행 중. 다음 회차에 꼭대기로.') && cp('===== 아카이브 메모 =====') === '8' && t.includes('선착장 · 등대 1층') && t.includes('[미해결] 젖은 발자국') && t.includes('노인이 맞이함 (소금빵)') && t.includes('한 일 · 토머스(나)') && t.includes('자물쇠를 땀.') && t.includes('노인 이름이 없음.'), JSON.stringify(t.slice(-16)));
  ok('서버에 내 이름과 세션을 보냄 (새로 만들기 꺼짐)', asked.length === 1 && asked[0].session === '1' && asked[0].me === '대장' && !asked[0].force, JSON.stringify(asked));
  const nm1 = await p.evaluate(() => window.__names[0]);
  ok('파일 이름: 방 이름 + 세션기록 + 회차', /세션기록 1회차\.hwpx$/.test(nm1), nm1);
  // 모든 세션 · 텍스트: 세션 사이 "N번째 세션!", 요약 없는 세션은 빼고 알려 줌
  asked.length = 0;
  await p.selectOption('#modalBody select', 'all');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#myRec_txt')]);
  const txt = fs.readFileSync(await d2.path(), 'utf8');
  await p.waitForTimeout(200);
  const note = await p.evaluate(() => [...document.querySelectorAll('#modalBody .note')].map(x => x.textContent).join(' | '));
  ok('모든 세션: 세션마다 차례로 요청, 둘째 세션 앞에 "2번째 세션!", 제목은 한 번만', asked.map(x => x.session).join(',') === '1,2,3' && txt.includes('\n2번째 세션!\n') && txt.split('CoC 안개 낀 등대').length === 2 && txt.indexOf('===== 아카이브 메모 (세션 2) =====') > txt.indexOf('2번째 세션!') && txt.split('엘리(소금빵): 기자.').length === 2, JSON.stringify(txt.slice(0, 120)));
  ok('요약이 없는 세션은 빼고 알려 줌', /요약이 없어 뺀 세션: 3/.test(note), note.slice(-200));
  // 새로 만들기
  asked.length = 0;
  await p.check('#myRec_force');
  await p.selectOption('#modalBody select', '2');
  await Promise.all([p.waitForEvent('download'), p.click('#myRec_txt')]);
  ok('"새로 만들기"를 켜면 force로 요청', asked.length === 1 && asked[0].force === true);
  // 보통 회의록 내보내기(한글)도 둘째 줄 KP/PL, 셋째 줄 캐릭터(나)
  await p.uncheck('#myRec_force'); await p.selectOption('#modalBody select', '1');
  const [d3] = await Promise.all([p.waitForEvent('download'), p.click('#modalBody button.pri')]);
  const sec3 = unzip(fs.readFileSync(await d3.path()), 'Contents/section0.xml');
  const t3 = (sec3.match(/<hp:t>([^<]*)<\/hp:t>/g) || []).map(x => x.replace(/<\/?hp:t>/g, ''));
  ok('회의록 한글 파일 머리말: 제목 → KP: 달토끼 / PL: 소금빵 → 엘리(소금빵), 토머스(나)', t3[1] === 'KP: 달토끼 / PL: 소금빵' && t3[2] === '엘리(소금빵), 토머스(나)' && /크툴루의 부름 · 내보낸 때/.test(t3[3]), JSON.stringify(t3.slice(0, 4)));
  ok('화면 오류 없음', errs.length === 0, errs.join(' / '));
  await b.close(); done();
})();
