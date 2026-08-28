// 画面の描画と操作

// 正解と次善手の受け入れ枚数の差。狭いほど見分けにくい問題になる
// 範囲を狭めすぎると条件に合う手牌が見つからず、かえって差の大きい問題が混ざる
const PRACTICE_GAP = { min: 1, max: 4 };
const CHALLENGE_GAP = { min: 1, max: 4 };

// 結果をポストするときに添えるURL（ローカルで開いた場合に使う）
const SITE_URL = 'https://onipoo.github.io/mj-nanikiru/';

// チャレンジモードの設定
const CHALLENGE = {
  timeLimit: 4000,      // 1問あたりの制限時間（ミリ秒）
  speedTimeLimit: 7000, // 上級は考える材料が多いので長めにとる
  goal: 100,            // クリアに必要な連続正解数
  queueSize: 3,         // 先読みしておく問題数
  speedQueueSize: 15,   // 上級は生成が重いので開始時にまとめて作り置きする
  speedRefillAt: 5,     // 上級で残りがこれを下回ったら1問ずつ補充する
};

// チャレンジモードの点棒
const SCORE = {
  start: 25000,   // 開始時の持ち点
  goal: 100000,   // これ以上でクリア
  maxMisses: 3,   // これだけ間違えたら終了
};

// 麻雀の点数表（ロン和了）。実戦に近くなるよう、安い手ほど出やすい重みを付けている
// 重みは親子で共通。点数だけ差し替える
const SCORE_WEIGHTS = [16, 12, 14, 12, 12, 8, 6, 10, 5, 3, 2, 1];
const SCORE_LABELS = [
  '1翻30符', '1翻40符', '2翻30符', '2翻40符', '3翻30符', '3翻40符',
  '4翻30符', '満貫', '跳満', '倍満', '三倍満', '役満',
];
const SCORE_CHILD  = [1000, 1300, 2000, 2600, 3900, 5200, 7700, 8000, 12000, 16000, 24000, 32000];
const SCORE_DEALER = [1500, 2000, 2900, 3900, 5800, 7700, 11600, 12000, 18000, 24000, 36000, 48000];

const SCORE_WEIGHT_TOTAL = SCORE_WEIGHTS.reduce((a, b) => a + b, 0);

// 子で正解を重ねるほど親になりやすくなる。3回正解したら次は必ず親
const DEALER_CHANCE = [1 / 3, 1 / 2, 1];

// 点数表から1つ引く
function drawScore(isDealer) {
  const table = isDealer ? SCORE_DEALER : SCORE_CHILD;
  let r = Math.random() * SCORE_WEIGHT_TOTAL;
  for (let i = 0; i < SCORE_WEIGHTS.length; i++) {
    r -= SCORE_WEIGHTS[i];
    if (r < 0) return { points: table[i], label: SCORE_LABELS[i], dealer: isDealer };
  }
  return { points: table[0], label: SCORE_LABELS[0], dealer: isDealer };
}

// 終了画面の一言。成績に応じて変える
const CHEERS = {
  clear: ['お見事です！', '完璧な打ち回しでした！', '文句なしのクリアです！'],
  high:  ['惜しい！あと一歩でした', 'かなりいい線いってます', '次はクリアできそうですね'],
  mid:   ['いい調子です', 'その調子で続けましょう', '手応えが出てきましたね'],
  low:   ['次はきっと伸びます', 'もう一度挑戦してみましょう', '練習モードで力をためましょう'],
};

// 上級の問題を探す試行回数。多いほど良問になるが生成が遅くなる
const SPEED_TRIES = { practice: 4000, challenge: 400 };

// いま使う制限時間
const currentTimeLimit = () =>
  state.challengeCriterion === 'speed' ? CHALLENGE.speedTimeLimit : CHALLENGE.timeLimit;

const state = {
  mode: 'practice',
  criterion: 'ukeire',  // 'ukeire'（受け入れ枚数）か 'speed'（和了の速さ）
  challengeCriterion: 'ukeire',
  target: null,   // 向聴数の指定。null なら 0〜3 からランダム
  problem: null,
  answered: false,
  build: new Array(34).fill(0), // 作成モードで組み立て中の手牌
  challenge: {
    running: false,
    correct: 0,
    score: SCORE.start,
    streak: 0,      // 連続正解数
    maxStreak: 0,
    misses: 0,
    deadline: 0,
    rafId: 0,
    queue: [],    // 先読み済みの問題
  },
};

const el = {
  modeTabs: document.querySelectorAll('.mode-tab'),
  practiceControls: document.getElementById('practice-controls'),
  target: document.getElementById('target'),
  criterion: document.getElementById('criterion'),
  challengeCriterion: document.getElementById('challenge-criterion'),
  ruleTime: document.getElementById('rule-time'),
  qText: document.getElementById('q-text'),
  resultHead: document.getElementById('result-head'),
  noteSummary: document.getElementById('note-summary'),
  noteUkeire: document.getElementById('note-ukeire'),
  noteSpeed: document.getElementById('note-speed'),
  intro: document.getElementById('intro'),
  start: document.getElementById('start'),
  prepare: document.getElementById('prepare'),
  hud: document.getElementById('hud'),
  hudCorrect: document.getElementById('hud-correct'),
  hudScore: document.getElementById('hud-score'),
  hudDelta: document.getElementById('hud-delta'),
  hudStreak: document.getElementById('hud-streak'),
  hudMiss: document.getElementById('hud-miss'),
  hudSeat: document.getElementById('hud-seat'),
  hudSeatNote: document.getElementById('hud-seat-note'),
  endDetail: document.getElementById('end-detail'),
  resume: document.getElementById('resume'),
  hudGoal: document.getElementById('hud-goal'),
  hudTime: document.getElementById('hud-time'),
  timerFill: document.getElementById('timer-fill'),
  play: document.getElementById('play'),
  hand: document.getElementById('hand'),
  loading: document.getElementById('loading'),
  qShanten: document.getElementById('q-shanten'),
  end: document.getElementById('end'),
  endTitle: document.getElementById('end-title'),
  endScore: document.getElementById('end-score'),
  endMessage: document.getElementById('end-message'),
  retry: document.getElementById('retry'),
  share: document.getElementById('share'),
  build: document.getElementById('build'),
  buildHand: document.getElementById('build-hand'),
  buildCount: document.getElementById('build-count'),
  buildSolve: document.getElementById('build-solve'),
  buildClear: document.getElementById('build-clear'),
  palette: document.getElementById('palette'),
  result: document.getElementById('result'),
  quickResult: document.getElementById('quick-result'),
  tableWrap: document.getElementById('table-wrap'),
  resultBody: document.getElementById('result-body'),
  verdict: document.getElementById('verdict'),
  next: document.getElementById('next'),
};

const show = (node, visible) => node.classList.toggle('hidden', !visible);
const shantenLabel = (s) => (s < 0 ? '和了' : s === 0 ? '聴牌' : s + 'シャンテン');

// --- 牌の描画 ---------------------------------------------------------

// 牌1枚のDOMを作る（枠の front.svg に絵柄を重ねる）
function tileNode(index, tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  const front = document.createElement('img');
  front.src = 'tiles/front.svg';
  front.alt = '';
  const face = document.createElement('img');
  face.src = 'tiles/' + TILE_NAMES[index] + '.svg';
  face.alt = TILE_LABELS[index];
  node.append(front, face);
  return node;
}

// 手牌を描画する
function renderHand(counts) {
  el.hand.textContent = '';
  for (const i of toTileList(counts)) {
    const btn = tileNode(i, 'button', 'tile');
    btn.type = 'button';
    btn.dataset.index = i;
    btn.title = TILE_LABELS[i];
    btn.addEventListener('click', () => answer(i));
    el.hand.appendChild(btn);
  }
}

// 手牌に正誤の色を付けて操作を止める。picked が null なら時間切れ
function markHand(picked) {
  const answers = state.problem.answers;
  for (const btn of el.hand.children) {
    const i = +btn.dataset.index;
    btn.disabled = true;
    if (answers.includes(i)) btn.classList.add('is-correct');
    else if (i === picked) btn.classList.add('is-wrong');
    else btn.classList.add('is-dim');
  }
}

// 問題を画面に出す
function showProblem(p) {
  state.problem = p;
  state.answered = false;
  show(el.result, false);
  el.qShanten.textContent = shantenLabel(p.shanten);
  renderHand(p.hand);
}

// 判定基準に応じて出題文と向聴数の選択肢を整える
function applyCriterion() {
  const speed = state.criterion === 'speed';
  el.qText.textContent = speed
    ? '何を切りますか？（12巡以内に和了できる確率が最も高い打牌が正解）'
    : '何を切りますか？（向聴数が最も進み、その中で受け入れが最大の打牌が正解）';
  // 説明欄は1つで、判定基準に応じて中身を入れ替える
  el.noteSummary.textContent = speed
    ? '上級モード（和了の速さ）の判定基準について'
    : 'この問題の判定基準について';
  show(el.noteUkeire, !speed);
  show(el.noteSpeed, speed);

  // 上級モードは聴牌と1シャンテンのみ対応
  for (const opt of el.target.options) {
    const deep = opt.value === '2' || opt.value === '3';
    opt.disabled = speed && deep;
  }
  if (speed && (el.target.value === '2' || el.target.value === '3' || el.target.value === '')) {
    el.target.value = '1';
    state.target = 1;
  }
}

// 判定基準に応じて1問生成する
function makeProblem(criterion, target) {
  if (criterion === 'speed') {
    // 上級は聴牌か1シャンテンのみ。指定がなければどちらかを選ぶ
    const t = target === 0 || target === 1 ? target : (Math.random() < 0.5 ? 0 : 1);
    return generateSpeedProblem(t, { maxTries: SPEED_TRIES[state.mode] ?? 4000 });
  }
  return generateProblem(target, state.mode === 'challenge' ? CHALLENGE_GAP : PRACTICE_GAP);
}

// --- 練習モード -------------------------------------------------------

function practiceNewProblem() {
  state.answered = false;
  state.problem = null;
  show(el.result, false);
  el.hand.textContent = '';
  el.qShanten.textContent = '-';
  el.loading.textContent =
    state.criterion === 'speed' ? '問題を生成中…（上級は少し時間がかかります）' : '問題を生成中…';
  show(el.loading, true);

  // 生成に少し時間がかかるので、先に「生成中」を描画させてから実行する
  setTimeout(() => {
    const p = makeProblem(state.criterion, state.target);
    show(el.loading, false);
    if (!p) {
      el.loading.textContent = '問題を生成できませんでした。もう一度お試しください。';
      show(el.loading, true);
      return;
    }
    showProblem(p);
  }, 20);
}

// --- チャレンジモード -------------------------------------------------

// 先読みの問題をキューに補充する（同期）
function fillQueue() {
  const c = state.challenge;
  const speed = state.challengeCriterion === 'speed';
  // 上級は1問が重いので、残りが少なくなったときに1問だけ足す
  if (speed) {
    if (c.queue.length >= CHALLENGE.speedRefillAt) return;
    const p = makeProblem('speed', null);
    if (p) c.queue.push(p);
    return;
  }
  while (c.queue.length < CHALLENGE.queueSize) {
    const p = makeProblem(state.challengeCriterion, null);
    if (!p) break;
    c.queue.push(p);
  }
}

// 開始前にまとめて作り置きする。1問ずつ作り、間に画面を更新して進捗を見せる
function prepareQueue(total, onDone) {
  const c = state.challenge;
  let made = 0;
  function step() {
    const p = makeProblem(state.challengeCriterion, null);
    if (p) c.queue.push(p);
    made++;
    el.prepare.textContent = '問題を準備中… ' + c.queue.length + ' / ' + total + ' 問';
    if (made < total) setTimeout(step, 0);
    else onDone();
  }
  el.prepare.textContent = '問題を準備中… 0 / ' + total + ' 問';
  setTimeout(step, 0);
}

function challengeStart() {
  const c = state.challenge;
  state.challengeCriterion = el.challengeCriterion.value;
  state.criterion = state.challengeCriterion; // 出題文と結果表示に反映する
  applyCriterion();
  c.correct = 0;
  c.score = SCORE.start;
  c.streak = 0;
  c.maxStreak = 0;
  c.misses = 0;
  c.lastHand = null;
  c.isDealer = false;
  c.dealerUsed = false;
  c.renchan = 0;
  c.maxRenchan = 0;
  c.childWins = 0;
  c.queue = [];
  show(el.start, false);
  show(el.prepare, true);

  const speed = state.challengeCriterion === 'speed';
  const total = speed ? CHALLENGE.speedQueueSize : CHALLENGE.queueSize;

  prepareQueue(total, () => {
    show(el.prepare, false);
    show(el.start, true);
    if (c.queue.length === 0) {
      el.prepare.textContent = '問題を生成できませんでした。もう一度お試しください。';
      show(el.prepare, true);
      return;
    }
    c.running = true;
    show(el.intro, false);
    show(el.play, true);
    show(el.hud, true);
    el.hudDelta.textContent = '';
    el.hudTime.textContent = (currentTimeLimit() / 1000).toFixed(1);
    updateHud();
    challengeNext();
  });
}

function challengeNext() {
  const c = state.challenge;
  const p = c.queue.shift() || makeProblem(state.challengeCriterion, null);
  if (!p) {
    challengeEnd(false, '問題を生成できませんでした。');
    return;
  }
  el.hudDelta.textContent = ''; // 前の問題の増減は消す

  // 親は1ゲームに最大1回。いちど親になったら、間違えるまで連荘する
  if (c.isDealer) {
    c.renchan++; // 親のまま正解したので連荘
  } else if (!c.dealerUsed && c.childWins > 0) {
    // 子で正解した回数が多いほど親になりやすい
    const rate = DEALER_CHANCE[Math.min(c.childWins, DEALER_CHANCE.length) - 1];
    if (Math.random() < rate) {
      c.isDealer = true;
      c.dealerUsed = true;
      c.renchan = 0;
      c.childWins = 0;
    }
  }
  updateSeat();
  showProblem(p);
  startTimer();
  // 手牌を読み始めてから次の問題を作る（生成中は画面が止まるため少し遅らせる）
  setTimeout(fillQueue, state.challengeCriterion === 'speed' ? 600 : 250);
}

function startTimer() {
  const c = state.challenge;
  c.deadline = Date.now() + currentTimeLimit();
  el.timerFill.classList.remove('is-warning');
  tick();
}

function tick() {
  const c = state.challenge;
  if (!c.running) return;
  const remain = c.deadline - Date.now();
  if (remain <= 0) {
    el.hudTime.textContent = '0.0';
    el.timerFill.style.width = '0%';
    challengeTimeout();
    return;
  }
  el.hudTime.textContent = (remain / 1000).toFixed(1);
  el.timerFill.style.width = (remain / currentTimeLimit()) * 100 + '%';
  el.timerFill.classList.toggle('is-warning', remain <= 1000);
  c.rafId = requestAnimationFrame(tick);
}

function stopTimer() {
  cancelAnimationFrame(state.challenge.rafId);
}

// 終了条件を満たしていれば終わらせる。終わったら true
function checkChallengeEnd() {
  const c = state.challenge;
  if (c.score >= SCORE.goal) { challengeEnd(true); return true; }
  if (c.score <= 0) { challengeEnd(false, 'no-points'); return true; }
  if (c.misses >= SCORE.maxMisses) { challengeEnd(false, 'misses'); return true; }
  return false;
}

// 不正解・時間切れの共通処理
function challengeMiss(picked) {
  const c = state.challenge;
  // 放銃した相手が親かどうか。
  // 自分が親なら他の3人は全員子。自分が子なら3人のうち1人が親なので 1/3
  const toDealer = c.isDealer ? false : Math.random() < 1 / 3;
  const row = drawScore(toDealer);
  c.score -= row.points;
  c.streak = 0;
  c.misses++;
  c.isDealer = false; // 放銃したので親は流れる
  c.renchan = 0;
  c.childWins = 0;
  c.lastHand = row;
  markHand(picked);
  updateHud(-row.points, (toDealer ? '親に放銃 ' : '子に放銃 ') + row.label);
  renderResult(picked, false);
  if (!checkChallengeEnd()) showResume();
}

function challengeAnswer(picked, ok) {
  stopTimer();
  const c = state.challenge;

  if (!ok) {
    challengeMiss(picked);
    return;
  }

  c.correct++;
  c.streak++;
  if (c.streak > c.maxStreak) c.maxStreak = c.streak;
  if (!c.isDealer) c.childWins++; // 子で正解すると、次に親が来やすくなる
  const row = drawScore(c.isDealer);
  c.score += row.points;
  c.lastHand = row;
  if (c.isDealer && c.renchan > c.maxRenchan) c.maxRenchan = c.renchan;
  const seatText = c.isDealer ? '親' + (c.renchan > 0 ? c.renchan + '連荘' : '') + ' ' : '';
  updateHud(row.points, seatText + row.label);

  if (checkChallengeEnd()) return;
  challengeNext();
}

function challengeTimeout() {
  state.answered = true;
  challengeMiss(null);
}

// 不正解のあと、解説を見てから次に進んでもらう
function showResume() {
  show(el.resume, true);
  el.resume.focus({ preventScroll: true });
}

function challengeResume() {
  show(el.resume, false);
  challengeNext();
}

// cleared: 目標点に届いたら true。reason: 'no-points' か 'misses'、または表示したい文言
function challengeEnd(cleared, reason) {
  const c = state.challenge;
  c.running = false;
  stopTimer();
  show(el.hud, false);
  show(el.resume, false);

  el.endTitle.textContent = cleared ? 'クリア！' : 'ゲームオーバー';
  el.endTitle.className = 'panel-title ' + (cleared ? 'is-clear' : 'is-over');
  el.endScore.textContent = Math.max(0, c.score).toLocaleString() + ' 点';
  el.endDetail.textContent =
    c.correct + '問正解 ／ 最大' + c.maxStreak + '問連続 ／ ミス' + c.misses + '回' +
    (c.maxRenchan > 0 ? ' ／ 親' + c.maxRenchan + '連荘' : '');
  // 成績に応じた一言を選ぶ
  let group = 'low';
  if (cleared) group = 'clear';
  else if (c.score >= SCORE.goal * 0.6) group = 'high';
  else if (c.score >= SCORE.start) group = 'mid';
  const lines = CHEERS[group];
  // 生成に失敗したときだけ、その旨を出す
  el.endMessage.textContent =
    !cleared && reason && reason !== 'no-points' && reason !== 'misses'
      ? reason
      : lines[(Math.random() * lines.length) | 0];
  el.share.href = shareLink(c.correct, cleared, c.score);
  show(el.end, true);
  // クリア時は最後の問題も正解しているので手牌と解説は出さない
  if (cleared) {
    show(el.play, false);
    show(el.result, false);
  }
  el.retry.focus({ preventScroll: true });
}

// X に結果をポストするリンクを作る
function shareLink(correct, cleared, score) {
  const pts = Math.max(0, score).toLocaleString();
  const text = cleared
    ? '麻雀 何切る問題のチャレンジモードをクリアしました！（' + correct + '問正解 / ' + pts + '点）'
    : '麻雀 何切る問題のチャレンジモードで ' + pts + '点（' + correct + '問正解）でした！';
  // file:// で開いている場合は公開URLを添える
  const url = location.protocol === 'https:'
    ? location.origin + location.pathname
    : SITE_URL;
  return 'https://x.com/intent/tweet?text=' + encodeURIComponent(text) +
    '&url=' + encodeURIComponent(url) +
    '&hashtags=' + encodeURIComponent('麻雀,何切る');
}

// いまの問題が親か子かを画面に出す
function updateSeat() {
  const c = state.challenge;
  el.hudSeat.textContent = c.isDealer ? '親' : '子';
  el.hudSeat.className = 'hud-seat' + (c.isDealer ? ' is-dealer' : '');
  if (c.isDealer) {
    // 親で正解するごとに 1連荘、2連荘…と増える
    el.hudSeatNote.textContent = c.renchan > 0 ? c.renchan + '連荘' : '';
    el.hudSeatNote.className = 'hud-seat-note is-renchan';
  } else {
    el.hudSeatNote.textContent = '';
    el.hudSeatNote.className = 'hud-seat-note';
  }
}

function updateHud(delta, label) {
  const c = state.challenge;
  el.hudCorrect.textContent = c.correct;
  el.hudGoal.textContent = SCORE.goal.toLocaleString();
  el.hudScore.textContent = Math.max(0, c.score).toLocaleString();
  el.hudStreak.textContent = c.streak >= 2 ? '（' + c.streak + '連続）' : '';
  el.hudMiss.textContent = 'ミス ' + c.misses + ' / ' + SCORE.maxMisses;
  el.hudMiss.classList.toggle('is-danger', c.misses >= SCORE.maxMisses - 1);

  // 増減と役名は、次の問題が始まるまで残す
  if (delta) {
    el.hudDelta.textContent =
      (label ? label + ' ' : '') + (delta > 0 ? '+' : '') + delta.toLocaleString();
    el.hudDelta.className = 'hud-delta ' + (delta > 0 ? 'is-plus' : 'is-minus');
  }
}

// --- 回答 -------------------------------------------------------------

function answer(picked) {
  if (state.answered || !state.problem) return;
  state.answered = true;

  const ok = state.problem.answers.includes(picked);
  if (state.mode === 'challenge') {
    challengeAnswer(picked, ok);
    return;
  }
  markHand(picked);
  renderResult(picked, ok);
}

// 打牌1つ分の評価を1行にする（チャレンジモードの簡易表示用）
function quickRow(discard, title, isBest) {
  const p = state.problem;
  const speed = state.criterion === 'speed' && p.speed;
  const row = document.createElement('div');
  row.className = 'quick-row' + (isBest ? ' is-best' : '');

  const label = document.createElement('span');
  label.className = 'quick-label';
  label.textContent = title;

  const tile = tileNode(discard, 'span', 'tile-mini');
  const name = document.createElement('span');
  name.className = 'quick-name';
  name.textContent = TILE_LABELS[discard];

  const info = document.createElement('span');
  info.className = 'quick-info';
  if (speed) {
    const r = p.speed.find((x) => x.discard === discard);
    info.textContent = shantenLabel(r.shanten) + '　12巡以内の和了率 ' +
      (r.rate === null ? '評価対象外' : (r.rate * 100).toFixed(1) + '%');
  } else {
    const r = p.results.find((x) => x.discard === discard);
    info.textContent = shantenLabel(r.shanten) + '　受け入れ ' + r.count + '枚';
  }

  row.append(label, tile, name, info);
  return row;
}

// チャレンジモードの結果表示。正解と自分の選んだ手だけを並べる
function renderQuickResult(picked) {
  const p = state.problem;
  el.quickResult.textContent = '';
  for (const a of p.answers) {
    el.quickResult.appendChild(quickRow(a, '正解', true));
  }
  if (picked !== null && !p.answers.includes(picked)) {
    el.quickResult.appendChild(quickRow(picked, 'あなたの選択', false));
  }
}

// picked が null なら時間切れ。verdictText を渡すと見出しを差し替える（作成モード用）
function renderResult(picked, ok, verdictText) {
  const p = state.problem;
  const answerText = p.answers.map((a) => TILE_LABELS[a]).join(' / ');
  if (verdictText !== undefined) {
    el.verdict.textContent = verdictText;
    el.verdict.className = 'verdict ok';
  } else {
    if (ok) {
      el.verdict.textContent = '正解！　' + answerText;
    } else if (picked === null) {
      el.verdict.textContent = '時間切れ　→　正解: ' + answerText;
    } else {
      el.verdict.textContent =
        '不正解　あなたの選択: ' + TILE_LABELS[picked] + '　→　正解: ' + answerText;
    }
    el.verdict.className = 'verdict ' + (ok ? 'ok' : 'ng');
  }

  // チャレンジモードは詳しい表を出さず、正解と自分の手だけを見せる
  const quick = state.mode === 'challenge';
  show(el.quickResult, quick);
  show(el.tableWrap, !quick);
  if (quick) {
    renderQuickResult(picked);
    show(el.next, false);
    show(el.result, true);
    return;
  }

  // 判定基準によって表の列が変わる
  const speed = state.criterion === 'speed' && p.speed;
  el.resultHead.textContent = '';
  const heads = speed
    ? ['打牌', '向聴', '受け入れ', '聴牌までの平均ツモ', '聴牌したときの待ち', '12巡以内の和了率']
    : ['打牌', '向聴', '受け入れ', '受け入れ牌'];
  for (const h of heads) {
    const th = document.createElement('th');
    th.textContent = h;
    el.resultHead.appendChild(th);
  }

  el.resultBody.textContent = '';
  const rows = speed ? p.speed : p.results;
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (p.answers.includes(r.discard)) tr.classList.add('best');
    if (r.discard === picked) tr.classList.add('picked');

    // 打牌
    const td1 = document.createElement('td');
    const cell = document.createElement('div');
    cell.className = 'tile-cell';
    cell.appendChild(tileNode(r.discard, 'span', 'tile-mini'));
    cell.append(TILE_LABELS[r.discard]);
    td1.appendChild(cell);

    // 向聴数
    const td2 = document.createElement('td');
    td2.textContent = shantenLabel(r.shanten);

    tr.append(td1, td2);

    if (speed) {
      const info = r.info;

      // 聴牌までの受け入れ（すでに聴牌ならその旨を出す）
      const td3 = document.createElement('td');
      if (!info) td3.textContent = '—';
      else if (info.intake === null) {
        td3.textContent = '聴牌';
        td3.className = 'muted';
      } else {
        td3.textContent = info.intake + '枚';
      }

      // 聴牌までの平均ツモ回数
      const tdT = document.createElement('td');
      if (!info) tdT.textContent = '—';
      else if (info.intake === null) {
        tdT.textContent = '—';
        tdT.className = 'muted';
      } else if (info.toTenpai >= NEVER) {
        tdT.textContent = '聴牌できない';
      } else {
        tdT.textContent = info.toTenpai.toFixed(2) + ' 回';
      }

      // 聴牌したときの待ち枚数
      const td4 = document.createElement('td');
      if (!info || info.wait === null) td4.textContent = '—';
      else if (info.intake === null) td4.textContent = info.wait + '枚';
      else td4.textContent = '平均 ' + info.wait.toFixed(1) + '枚';

      // 12巡以内に和了できる確率
      const td5 = document.createElement('td');
      td5.className = 'count';
      td5.textContent = r.rate === null ? '—' : (r.rate * 100).toFixed(1) + ' %';

      tr.append(td3, tdT, td4, td5);
    } else {
      // 受け入れ枚数
      const td3 = document.createElement('td');
      td3.className = 'count';
      // 聴牌の場合の受け入れは和了牌の枚数（待ちの広さ）なので区別して表示する
      td3.textContent = r.shanten === 0 ? r.count + '枚（待ち）' : r.count + '枚';

      // 受け入れ牌
      const td4 = document.createElement('td');
      const list = document.createElement('div');
      list.className = 'uke-list';
      for (const t of r.tiles) list.appendChild(tileNode(t, 'span', 'tile-mini'));
      if (r.tiles.length === 0) list.textContent = 'なし';
      td4.appendChild(list);

      tr.append(td3, td4);
    }

    el.resultBody.appendChild(tr);
  }

  // 「次の問題」ボタンは練習モードだけ使う
  show(el.next, state.mode === 'practice');
  show(el.result, true);
  if (state.mode === 'practice') {
    // フォーカス移動で手牌が画面外へスクロールしないようにする
    el.next.focus({ preventScroll: true });
  }
}

// --- 作成モード -------------------------------------------------------

const BUILD_MAX = 14;

const buildTotal = () => state.build.reduce((a, b) => a + b, 0);

// 牌を選ぶパレットを作る（萬子・筒子・索子・字牌の4行）
function renderPalette() {
  el.palette.textContent = '';
  const rows = [[0, 9], [9, 18], [18, 27], [27, 34]];
  for (const [from, to] of rows) {
    const row = document.createElement('div');
    row.className = 'palette-row';
    for (let i = from; i < to; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-cell';
      btn.dataset.index = i;
      btn.title = TILE_LABELS[i];
      btn.appendChild(tileNode(i, 'span', 'tile-small'));
      const rest = document.createElement('span');
      rest.className = 'palette-rest';
      btn.appendChild(rest);
      btn.addEventListener('click', () => buildAdd(i));
      row.appendChild(btn);
    }
    el.palette.appendChild(row);
  }
  updatePalette();
}

// パレットの残り枚数表示と、押せるかどうかを更新する
function updatePalette() {
  const full = buildTotal() >= BUILD_MAX;
  for (const btn of el.palette.querySelectorAll('.palette-cell')) {
    const i = +btn.dataset.index;
    const rest = 4 - state.build[i];
    btn.querySelector('.palette-rest').textContent = rest;
    btn.disabled = rest === 0 || full;
  }
}

// 組み立て中の手牌を描画する（クリックで1枚戻す）
function renderBuildHand() {
  el.buildHand.textContent = '';
  for (const i of toTileList(state.build)) {
    const btn = tileNode(i, 'button', 'tile');
    btn.type = 'button';
    btn.dataset.index = i;
    btn.title = TILE_LABELS[i] + 'を戻す';
    btn.addEventListener('click', () => buildRemove(i));
    el.buildHand.appendChild(btn);
  }
  const total = buildTotal();
  el.buildCount.textContent = total;
  el.buildSolve.disabled = total !== BUILD_MAX;
}

function buildRefresh() {
  renderBuildHand();
  updatePalette();
  show(el.result, false); // 手牌を変えたら前の解析結果は消す
}

function buildAdd(i) {
  if (buildTotal() >= BUILD_MAX || state.build[i] >= 4) return;
  state.build[i]++;
  buildRefresh();
}

function buildRemove(i) {
  if (state.build[i] === 0) return;
  state.build[i]--;
  buildRefresh();
}

function buildClear() {
  state.build.fill(0);
  buildRefresh();
}

// 組み立てた手牌を解析して結果を出す
function buildSolve() {
  if (buildTotal() !== BUILD_MAX) return;
  state.criterion = 'ukeire'; // 作成モードは受け入れ枚数で表示する
  const hand = state.build.slice();
  const results = analyzeHand(hand);
  const best = results[0];
  const answers = results
    .filter((r) => r.shanten === best.shanten && r.count === best.count)
    .map((r) => r.discard);
  state.problem = { hand, results, answers, shanten: best.shanten };

  // 手牌の最善手に印を付ける
  for (const btn of el.buildHand.children) {
    const i = +btn.dataset.index;
    btn.classList.toggle('is-correct', answers.includes(i));
  }

  const label = shantenLabel(best.shanten);
  renderResult(undefined, true, label + '　最善手: ' + answers.map((a) => TILE_LABELS[a]).join(' / '));
}

// --- モード切替 -------------------------------------------------------

function setMode(mode) {
  state.mode = mode;
  stopTimer();
  state.challenge.running = false;
  state.challenge.queue = [];

  for (const tab of el.modeTabs) {
    tab.classList.toggle('is-active', tab.dataset.mode === mode);
  }
  show(el.practiceControls, mode === 'practice');
  show(el.result, false);
  show(el.end, false);
  show(el.hud, false);
  show(el.resume, false);
  show(el.intro, false);
  show(el.build, mode === 'build');
  show(el.play, mode === 'practice');

  if (mode === 'practice') {
    state.criterion = el.criterion.value;
    applyCriterion();
    practiceNewProblem();
  } else if (mode === 'challenge') {
    // チャレンジは説明画面から始める
    show(el.intro, true);
    show(el.start, true);
    show(el.prepare, false);
    el.hand.textContent = '';
    state.problem = null;
  } else {
    // 作成モードは前回組み立てた手牌をそのまま残す
    state.problem = null;
    buildRefresh();
  }
}

// --- 起動 -------------------------------------------------------------

for (const tab of el.modeTabs) {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
}
el.next.addEventListener('click', practiceNewProblem);
el.criterion.addEventListener('change', () => {
  state.criterion = el.criterion.value;
  applyCriterion();
  practiceNewProblem();
});
el.target.addEventListener('change', () => {
  state.target = el.target.value === '' ? null : +el.target.value;
  practiceNewProblem();
});
// 説明画面で判定基準を変えたら制限時間の表示も直す
function updateIntroRules() {
  const speed = el.challengeCriterion.value === 'speed';
  const sec = (speed ? CHALLENGE.speedTimeLimit : CHALLENGE.timeLimit) / 1000;
  el.ruleTime.textContent = '1問 ' + sec + '秒';
}
el.challengeCriterion.addEventListener('change', updateIntroRules);
el.start.addEventListener('click', challengeStart);
el.resume.addEventListener('click', challengeResume);
el.buildSolve.addEventListener('click', buildSolve);
el.buildClear.addEventListener('click', buildClear);
el.retry.addEventListener('click', () => setMode('challenge'));
// 練習モードでは回答後にスペースキーで次の問題へ
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (state.mode === 'practice' && state.answered) {
    e.preventDefault();
    practiceNewProblem();
  } else if (state.mode === 'challenge' && !el.resume.classList.contains('hidden')) {
    e.preventDefault();
    challengeResume();
  }
});

renderPalette();
updateIntroRules();
applyCriterion();
setMode('practice');
