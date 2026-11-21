// AI 품질 채점 도구(tests/quality/score.js) 자체가 맞게 세는지 본다. 사람이 만든 "잘한 답"과 "틀린 답"을 넣어 본다.
// 실제 AI 출력을 채점한 것이 아니다. 실제 Claude 품질은 이 시험으로 알 수 없다 (tests/quality/README.md의 절차로 연습 방에서 잰다).
const { ok, done } = require('./lib.js');
const { score } = require('./quality/score.js'), { session2, key } = require('./quality/fixture.js');
const good = {
  summary: ['【현관】', '- 집사 윌리엄이 주인은 여행 중이며 자신은 서재에 들어간 적이 없다고 말함 (주장)', '- [판정] 한기자 심리학 실패: 집사의 표정에서 읽은 것 없음', '- (추측) 한기자는 집사가 범인이고 편지도 숨겼다고 의심함',
    '【서재】', '- [판정] 최교수 도서관 이용 실패', '- [판정] 박형사 관찰력 성공: 벽난로 안쪽 벽돌 하나가 헐겁다', '- 책상 서랍에서 찢어진 일기를 찾음. 마지막 장이 없고 "그것을 지하에 가두었다"고 적혀 있음',
    '【지하실 계단】', '- 쿵 소리를 듣고 지하실로 내려가는 계단 앞으로 감', '- [판정] 한기자 듣기 성공: 쇠사슬이 끌리는 소리와 물 떨어지는 소리', '- 서재로 돌아가 벽돌을 먼저 빼 보고 그다음 내려가기로 함'].join('\n'),
  notes: { clues: [{ text: '벽난로 벽돌 하나가 헐겁다', status: '미해결', kind: '확인' }, { text: '찢어진 일기의 마지막 장이 없다', status: '미해결', kind: '확인' }, { text: '집사는 서재에 들어간 적 없다고 주장함', status: '미해결', kind: '주장' }] },
  next: { now: { scene: '지하실 계단 앞 (서재로 돌아가는 중)', just: '쇠사슬 소리를 들음', agreed: '벽돌을 먼저 빼 본다', held: '지하실은 그다음' },
    items: [{ kind: '행동', title: '서재로 돌아가 벽난로의 헐거운 벽돌을 빼 본다', why: '방금 그렇게 하기로 함', prio: 1 }, { kind: '장소', title: '지하실 계단을 내려간다', why: '쇠사슬 소리', prio: 2 }, { kind: '단서', title: '일기의 뒷장을 찾는다', why: '마지막 장이 없음', prio: 2 }] }
};
const g = score(Object.assign({ kbUploaded: true }, good));
ok('잘한 답: 누락 0, 지어냄·뒤바뀜·혼동·반복·누출 0, 합격선 넘음', g.pass && g.verdict === '자동 채점 합격' && g.metrics['핵심 단서 누락'] === '0/5' && g.metrics['단서 누락률'] === '0/' + key.facts.length && g.metrics['판정 성공/실패 뒤바뀜'] === 0 && g.metrics['주장을 사실처럼 적음'] === 0 && g.metrics['추측을 사실처럼 적음'] === 0 && g.metrics['마스터 자료 누출'] === 0 && g.metrics['지금 장면이 맞음'] === '예', JSON.stringify(g.metrics) + JSON.stringify(g.detail));
const bad = {
  summary: ['【현관】', '- 집사는 서재에 들어간 적이 없다', '- 주인은 여행 중이다', '- 박형사가 저택에 불을 질렀다', '- 한기자가 집사를 의자에 묶었다', '- 집사가 범인이다', '- 다음 주 금요일에 다시 모이기로 함',
    '【서재】', '- [판정] 최교수 도서관 이용 성공', '- [판정] 박형사 관찰력 실패', '- 벽날로 벽돌을 뺐더니 편지를 찾았다', '- 지하로 가는 길을 먼저 찾아보자 (확정 전)', '- 주인 에드먼드는 지하 금고에 갇혀 있다', '- 지하실로 내려갔다'].join('\n'),
  notes: { clues: [{ text: '금고 번호 0412', status: '미해결' }] },
  next: { now: { scene: '저택 현관' }, items: [{ title: '현관 열쇠를 찾는다', prio: 1 }, { title: '정원의 발자국을 조사한다', prio: 1 }, { title: '책상 서랍을 열어 본다', prio: 2 }] }
};
const x = score(Object.assign({ kbUploaded: true }, bad)), m = x.metrics;
ok('틀린 답: 단서 누락을 셈', Number(m['단서 누락률'].split('/')[0]) >= 4, m['단서 누락률']);
ok('틀린 답: 농담·가정·잡담·지어낸 일을 잡음', m['지어낸 사실·농담·가정을 사건으로 적음'] >= 4, String(m['지어낸 사실·농담·가정을 사건으로 적음']));
ok('틀린 답: 판정 성공/실패 뒤바뀜 2건, 빠진 판정 2건', m['판정 성공/실패 뒤바뀜'] === 2 && m['판정 빠짐'] === 2, JSON.stringify(x.detail.rolls));
ok('틀린 답: NPC 주장·플레이어 추측을 사실처럼 적은 것을 잡음', m['주장을 사실처럼 적음'] === 2 && m['추측을 사실처럼 적음'] === 1, JSON.stringify(x.detail.claims));
ok('틀린 답: 이미 끝난 일 다시 추천 3건, 하기로 한 일이 빠짐', m['이미 끝난 일을 다시 추천'] === 3 && m['하기로 한 일이 맨 위에 없음'] === 1 && m['추천에 빠진 것'] === 3);
ok('틀린 답: 마스터 자료 누출, 받아쓰기 표시, 인식 오류, 틀린 장면', m['마스터 자료 누출'] === 1 && m['받아쓰기 표시·안내를 요약에 옮김'] === 1 && m['잘못 들린 낱말을 그대로 적음'] === 1 && /^아니오/.test(m['지금 장면이 맞음']) && !x.pass);
ok('대본에 함정이 모두 들어 있음 (농담·가정·성공/실패 판정·거짓말·추측·장면 전환·인식 오류·복구된 말·지난 세션 정보)', ['불 지르고', '만약에', '실패입니다', '성공입니다', '들어간 적이 없습니다', '내 생각엔', '장면을 바꾸겠습니다', '집싸', '(확정 전)', '※ 받아쓰기 끊김', '정원사가 봤다는'].every(w => session2.some(l => l[1].indexOf(w) >= 0)));
// 5차 검토에서 강화한 합격선
const G = (o) => score(Object.assign({ kbUploaded: true }, good, o));
const cut = (re) => good.summary.split('\n').filter(l => !re.test(l)).join('\n');
const noClue = { clues: [] };
ok('핵심 단서가 하나라도 빠지면 불합격 (예전 합격선 "8개 중 1개 이하"로는 통과하던 답)', (r => !r.pass && r.verdict === '불합격' && r.metrics['핵심 단서 누락'] === '1/5' && /핵심 단서 1개 누락/.test(r.fail.join()))(G({ summary: cut(/쇠사슬/) })), JSON.stringify(G({ summary: cut(/쇠사슬/) }).fail));
const one = G({ summary: good.summary.replace('주인은 여행 중이며 ', '') }), two = G({ summary: cut(/여행 중/), notes: { clues: good.notes.clues.slice(0, 2) } });
ok('부가 정보는 하나까지 빠져도 합격, 둘이 빠지면 불합격', one.metrics['부가 정보 누락'] === '1/3' && one.pass && two.metrics['부가 정보 누락'] === '2/3' && !two.pass, JSON.stringify([one.metrics['부가 정보 누락'], one.verdict, two.metrics['부가 정보 누락'], two.verdict]));
ok('플레이어 추측을 사실처럼 적으면 불합격', (r => !r.pass && /추측/.test(r.fail.join()))(G({ summary: good.summary.replace('- (추측) 한기자는 집사가 범인이고 편지도 숨겼다고 의심함', '- 집사가 범인이다') })));
ok('AI가 추천을 만들지 못하면 다른 항목이 좋아도 불합격, 추천 항목은 "확인 못 함"', (r => !r.pass && r.verdict === '불합격' && r.metrics['이미 끝난 일을 다시 추천'] === '확인 못 함' && r.metrics['추천을 만들었나'] === '아니오')(G({ next: null })));
ok('지금 장면이 틀리면 불합격', (r => !r.pass && /장면/.test(r.fail.join()))(G({ next: Object.assign({}, good.next, { now: { scene: '저택 현관' } }) })));
ok('하기로 한 일이 맨 위에 없으면 불합격', (r => !r.pass && /맨 위/.test(r.fail.join()))(G({ next: Object.assign({}, good.next, { items: good.next.items.map(i => Object.assign({}, i, { prio: 2 })) }) })));
ok('마스터 자료 등록을 확인하지 못했으면 누출 0건이어도 합격이 아니라 "미확인"', (r => !r.pass && r.verdict === '미확인' && /확인 못 함/.test(String(r.metrics['마스터 자료 누출'])))(score(good)) && (r => r.verdict === '미확인')(score(Object.assign({ kbUploaded: false }, good))));
ok('누출이 실제로 보이면 등록 확인 여부와 상관없이 불합격', (r => r.verdict === '불합격' && r.metrics['마스터 자료 누출'] === 1)(score(Object.assign({}, good, { summary: good.summary + '\n- 금고 번호는 0412' }))));
ok('앞선 시험 기록이 섞인 방에서 돌렸으면 "미확인"', (r => r.verdict === '미확인' && /섞여/.test(r.unknown.join()))(G({ mixed: true })));
void noClue;
done();
