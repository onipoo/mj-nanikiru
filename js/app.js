// 画面の描画と操作

// 正解と次善手の受け入れ枚数の差。狭いほど見分けにくい問題になる
// 範囲を狭めすぎると条件に合う手牌が見つからず、かえって差の大きい問題が混ざる
const PRACTICE_GAP = { min: 1, max: 4 };
const CHALLENGE_GAP = { min: 1, max: 4 };

// チャレンジモードの設定
const CHALLENGE = {
  timeLimit: 4000, // 1問あたりの制限時間（ミリ秒）
  goal: 100,       // クリアに必要な連続正解数
  queueSize: 3,    // 先読みしておく問題数
};

const state = {
  mode: 'practice',
  target: null,   // 向聴数の指定。null なら 0〜3 からランダム
  problem: null,
  answered: false,
  build: new Array(34).fill(0), // 作成モードで組み立て中の手牌
  challenge: {
    running: false,
    correct: 0,
    deadline: 0,
    rafId: 0,
    queue: [],    // 先読み済みの問題
  },
};

const el = {
  modeTabs: document.querySelectorAll('.mode-tab'),
  practiceControls: document.getElementById('practice-controls'),
  target: document.getElementById('target'),
  intro: document.getElementById('intro'),
  start: document.getElementById('start'),
  prepare: document.getElementById('prepare'),
  hud: document.getElementById('hud'),
  hudCorrect: document.getElementById('hud-correct'),
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
  build: document.getElementById('build'),
  buildHand: document.getElementById('build-hand'),
  buildCount: document.getElementById('build-count'),
  buildSolve: document.getElementById('build-solve'),
  buildClear: document.getElementById('build-clear'),
  palette: document.getElementById('palette'),
  result: document.getElementById('result'),
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

// --- 練習モード -------------------------------------------------------

function practiceNewProblem() {
  state.answered = false;
  state.problem = null;
  show(el.result, false);
  el.hand.textContent = '';
  el.qShanten.textContent = '-';
  el.loading.textContent = '問題を生成中…';
  show(el.loading, true);

  // 生成に少し時間がかかるので、先に「生成中」を描画させてから実行する
  setTimeout(() => {
    const p = generateProblem(state.target, PRACTICE_GAP);
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

// 先読みの問題をキューに補充する
function fillQueue() {
  const q = state.challenge.queue;
  while (q.length < CHALLENGE.queueSize) {
    const p = generateProblem(null, CHALLENGE_GAP);
    if (!p) break;
    q.push(p);
  }
}

function challengeStart() {
  const c = state.challenge;
  c.correct = 0;
  c.queue = [];
  show(el.start, false);
  show(el.prepare, true);

  // 準備中の表示を出してからまとめて生成する
  setTimeout(() => {
    fillQueue();
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
    updateHud();
    challengeNext();
  }, 20);
}

function challengeNext() {
  const c = state.challenge;
  const p = c.queue.shift() || generateProblem(null, CHALLENGE_GAP);
  if (!p) {
    challengeEnd(false, '問題を生成できませんでした。');
    return;
  }
  showProblem(p);
  startTimer();
  // 手牌を読み始めてから次の問題を作る（生成中は画面が止まるため少し遅らせる）
  setTimeout(fillQueue, 250);
}

function startTimer() {
  const c = state.challenge;
  c.deadline = Date.now() + CHALLENGE.timeLimit;
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
  el.timerFill.style.width = (remain / CHALLENGE.timeLimit) * 100 + '%';
  el.timerFill.classList.toggle('is-warning', remain <= 1000);
  c.rafId = requestAnimationFrame(tick);
}

function stopTimer() {
  cancelAnimationFrame(state.challenge.rafId);
}

function challengeAnswer(picked, ok) {
  stopTimer();
  const c = state.challenge;
  if (!ok) {
    markHand(picked);
    renderResult(picked, false);
    challengeEnd(false);
    return;
  }
  c.correct++;
  updateHud();
  if (c.correct >= CHALLENGE.goal) {
    challengeEnd(true);
    return;
  }
  challengeNext();
}

function challengeTimeout() {
  state.answered = true;
  markHand(null);
  renderResult(null, false);
  challengeEnd(false);
}

// cleared: 100問クリアなら true
function challengeEnd(cleared, errorMessage) {
  const c = state.challenge;
  c.running = false;
  stopTimer();
  show(el.hud, false);

  el.endTitle.textContent = cleared ? 'クリア！' : 'ゲームオーバー';
  el.endTitle.className = 'panel-title ' + (cleared ? 'is-clear' : 'is-over');
  el.endScore.textContent = c.correct + ' 問連続正解';
  el.endMessage.textContent = errorMessage
    ? errorMessage
    : cleared
    ? CHALLENGE.goal + '問すべて正解しました。'
    : '下の表で正解を確認できます。';
  show(el.end, true);
  // クリア時は最後の問題も正解しているので手牌と解説は出さない
  if (cleared) {
    show(el.play, false);
    show(el.result, false);
  }
  el.retry.focus({ preventScroll: true });
}

function updateHud() {
  el.hudCorrect.textContent = state.challenge.correct;
  el.hudGoal.textContent = CHALLENGE.goal;
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

  el.resultBody.textContent = '';
  for (const r of p.results) {
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

    tr.append(td1, td2, td3, td4);
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
  show(el.intro, false);
  show(el.build, mode === 'build');
  show(el.play, mode === 'practice');

  if (mode === 'practice') {
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
el.target.addEventListener('change', () => {
  state.target = el.target.value === '' ? null : +el.target.value;
  practiceNewProblem();
});
el.start.addEventListener('click', challengeStart);
el.buildSolve.addEventListener('click', buildSolve);
el.buildClear.addEventListener('click', buildClear);
el.retry.addEventListener('click', () => setMode('challenge'));
// 練習モードでは回答後にスペースキーで次の問題へ
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && state.mode === 'practice' && state.answered) {
    e.preventDefault();
    practiceNewProblem();
  }
});

renderPalette();
setMode('practice');
