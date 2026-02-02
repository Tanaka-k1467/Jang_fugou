/****************************************************
 * 雀富豪 CPU戦用 game.js（最終完全版）
 * ・南面は永続しない（場が流れたら解除）
 * ・革命は永続（革命返しまで）
 * ・手札は配牌時のみソート（以降固定）
 * ・8切り / 倒す / パス
 * ・場履歴ポップアップ
 * ・CPUが1,2を最優先で出すバグ修正済み
 ****************************************************/

let deck = [];
let hand = [];
let cpuHands = [];  // 複数CPU対応
let field = [];
let selected = [];
let fieldStack = [];

let playerCount = 2;  // プレイヤー数（2, 3, 4）
let turn = "player";
let lockedCount = 0;
let lastPlayer = null;  // 直近で牌を出したプレイヤー（"player" or "cpu0", "cpu1", "cpu2"）

// 状態フラグ
let isReversed = false;   // 革命（永続）
let nanmenActive = false; // 南面（場が残っている間だけ）

// 後方互換性のため
get cpuHand() {
    return cpuHands[0] || [];
}


/****************************************************
 * 強さ（弱 → 強）
 ****************************************************/
function strengthBase(v) {
    if (v === 99) return 14;  // 赤（最強）
    if (v === 2) return 13;
    if (v === 1) return 12;
    if (v === 13) return 11;  // 北
    if (v === 12) return 10;  // 西
    if (v === 11) return 9;   // 南
    if (v === 10) return 8;   // 東
    return v - 2;             // 3→1
}

/****************************************************
 * 効果反転？（革命 XOR 南面）
 ****************************************************/
function isStrengthReversed() {
    return isReversed ^ nanmenActive;
}

/****************************************************
 * 強さ比較
 ****************************************************/
function isStronger(a, b) {
    const sa = strengthBase(a);
    const sb = strengthBase(b);

    return isStrengthReversed() ? (sa < sb) : (sa > sb);
}


/****************************************************
 * デッキ生成
 ****************************************************/
function createDeck() {
    const d = [];

    // 数牌 1〜9 各4
    for (let i = 1; i <= 9; i++)
        for (let j = 0; j < 4; j++) d.push(i);

    // 東南西北 各4
    for (let i = 10; i <= 13; i++)
        for (let j = 0; j < 4; j++) d.push(i);

    // 赤牌2枚
    d.push(99, 99);

    return d;
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [a[i], a[r]] = [a[r], a[i]];
    }
    return a;
}


/****************************************************
 * 配牌（この時だけソート）
 ****************************************************/
function deal() {
    deck = shuffle(createDeck());

    // プレイヤー数に応じて配牌
    const cardsPerPlayer = Math.floor(deck.length / playerCount);
    hand = deck.slice(0, cardsPerPlayer);
    
    cpuHands = [];
    for (let i = 0; i < playerCount - 1; i++) {
        const start = cardsPerPlayer * (i + 1);
        const end = start + cardsPerPlayer;
        cpuHands.push(deck.slice(start, end));
    }

    // 配牌時だけソート
    hand.sort((a, b) => strengthBase(a) - strengthBase(b));
    cpuHands.forEach(h => h.sort((a, b) => strengthBase(a) - strengthBase(b)));

    renderHand();
    updateCpuCount();
    updateField();
}


/****************************************************
 * UI
 ****************************************************/
function cardText(v) {
    if (v === 99) return "赤";
    if (v >= 10 && v <= 13) return ["東","南","西","北"][v - 10];
    return String(v);
}

function renderHand() {
    const p = document.getElementById("hand");
    p.innerHTML = "";

    hand.forEach((v, i) => {
        const d = document.createElement("div");
        d.className = "card";
        d.textContent = cardText(v);
        if (selected.includes(i)) d.classList.add("selected");

        d.onclick = () => toggleSelect(i);
        p.appendChild(d);
    });
}

function updateField() {
    const f = document.getElementById("field");
    f.innerHTML = "";

    if (field.length === 0) return;

    // ★ここがタイプミス修正済み
    field.forEach(v => {
        const d = document.createElement("div");
        d.className = "card";
        d.textContent = "(" + cardText(v) + ")";
        f.appendChild(d);
    });
}

function updateCpuCount() {
    let text = "";
    for (let i = 0; i < cpuHands.length; i++) {
        text += `CPU${i+1}の手札: ${cpuHands[i].length}牌\n`;
    }
    document.getElementById("cpuCount").textContent = text;
}


/****************************************************
 * 選択
 ****************************************************/
function toggleSelect(i) {
    if (selected.includes(i))
        selected = selected.filter(x => x !== i);
    else
        selected.push(i);

    renderHand();
}


/****************************************************
 * 出せるか？
 ****************************************************/
function canPlay(cards) {
    if (cards.length === 0) return false;
    if (new Set(cards).size !== 1) return false;

    if (field.length === 0) return true;
    if (cards.length !== field.length) return false;

    return isStronger(cards[0], field[0]);
}


/****************************************************
 * 特殊効果チェック
 ****************************************************/
function checkRevolution(cards) {
    if (cards.length !== 4) return false;

    if (new Set(cards).size === 1) return true;

    const sorted = cards.slice().sort((a, b) => a - b);
    return JSON.stringify(sorted) === JSON.stringify([10, 11, 12, 13]);
}

function checkNanmen(cards) {
    // 南（11）が含まれているか判定
    return cards.some(c => c === 11);
}

function checkEightCut(cards) {
    return cards.includes(8);
}


/****************************************************
 * 出す
 ****************************************************/
function play() {
    if (turn !== "player") return;

    const cards = selected.map(i => hand[i]);
    cards.sort((a, b) => strengthBase(a) - strengthBase(b));

    if (!canPlay(cards)) {
        alert("その組み合わせは出せません");
        return;
    }

    const rev = checkRevolution(cards);
    const nan = checkNanmen(cards);
    const eightCut = checkEightCut(cards);

    field = cards;
    lockedCount = cards.length;
    lastPlayer = "player";  // プレイヤーが牌を出した

    fieldStack.push(cards.slice());

    // 手牌削除
    hand = hand.filter((_, i) => !selected.includes(i));
    selected = [];

    renderHand();
    updateField();

    if (nan) nanmenActive = true;

    if (rev) isReversed = !isReversed;

    if (eightCut) {
        alert("8切り！ 場が流れます");
        field = [];
        lockedCount = 0;
        fieldStack = [];
        nanmenActive = false;
        updateField();
        return; // ★ターンは変わらない（効果通り）
    }

    if (hand.length === 0) {
        alert("あなたの勝ち！");
        setTimeout(() => location.reload(), 1000);
        return;
    }

    turn = "cpu";
    setTimeout(cpuTurn, 500);
}


/****************************************************
 * パス
 ****************************************************/
function pass() {
    if (turn !== "player") return;

    field = [];
    lockedCount = 0;
    fieldStack = [];
    nanmenActive = false;

    updateField();

    turn = "cpu";
    setTimeout(cpuTurn, 500);
}


/****************************************************
 * 倒す（場全部取る）
 ****************************************************/
function canTake() {
    if (field.length === 0) return false;
    if (fieldStack.length === 0) return false;
    
    // 倒すための条件：場の段数 >= 出された枚数 + 1
    const fieldStages = fieldStack.length;
    const requiredStages = lockedCount + 1;
    
    return fieldStages >= requiredStages;
}

function take() {
    if (turn !== "player") return;
    
    if (!canTake()) {
        const fieldStages = fieldStack.length;
        const requiredStages = lockedCount + 1;
        return alert(`倒すには場に${requiredStages}段以上の牌が必要です（現在：${fieldStages}段）`);
    }

    hand = hand.concat(field);
    // 手牌を強さでソート（上位に強い牌を並べる）
    hand.sort((a, b) => strengthBase(a) - strengthBase(b));

    field = [];
    lockedCount = 0;
    fieldStack = [];
    nanmenActive = false;

    renderHand();
    updateField();
    
    // 倒したプレイヤーの次のプレイヤーにターンを渡す
    // プレイヤーが倒す → CPUにターン
    turn = turn === "player" ? "cpu" : "player";
    
    if (turn === "cpu") {
        setTimeout(cpuTurn, 500);
    }
}


/****************************************************
 * CPU 思考
 ****************************************************/
function groupByValue(arr) {
    const m = {};
    arr.forEach(v => {
        if (!m[v]) m[v] = [];
        m[v].push(v);
    });
    return Object.values(m);
}

function cpuTurn() {
    console.log("=== cpuTurn開始 ===");
    console.log("turn:", turn);
    console.log("field.length:", field.length);
    console.log("cpuHand:", cpuHand);

    let groups = groupByValue(cpuHand);

    // ★重要：弱い→強い順に正しくソート
    groups.sort((a, b) => strengthBase(a[0]) - strengthBase(b[0]));

    let playSet = null;

    if (field.length === 0) {
        // 場がクリアされている場合、最も弱い牌を出す
        playSet = groups[0];
    } else {
        // 場に牌がある場合、同じ枚数で強い牌を探す
        const need = field.length;
        for (const g of groups) {
            if (g.length === need && isStronger(g[0], field[0])) {
                playSet = g;
                break;
            }
        }
    }

    if (!playSet) {
        console.log("CPUがパス");
        field = [];
        lockedCount = 0;
        fieldStack = [];
        nanmenActive = false;

        updateField();
        turn = "player";
        return;
    }

    const rev = checkRevolution(playSet);
    const nan = checkNanmen(playSet);
    const eightCut = checkEightCut(playSet);

    console.log("CPUが牌を出す:", playSet);
    field = playSet;
    lockedCount = playSet.length;
    lastPlayer = "cpu";  // CPUが牌を出した

    fieldStack.push(playSet.slice());

    playSet.forEach(v => cpuHand.splice(cpuHand.indexOf(v), 1));

    updateCpuCount();
    updateField();

    if (nan) nanmenActive = true;
    if (rev) isReversed = !isReversed;

    if (eightCut) {
        alert("CPUの8切り！ 場が流れます");
        field = [];
        lockedCount = 0;
        fieldStack = [];
        nanmenActive = false;

        updateField();
        setTimeout(cpuTurn, 500);
        return; // ★ターンは続行
    }

    if (cpuHand.length === 0) {
        alert("CPUの勝ち！");
        setTimeout(() => location.reload(), 1000);
        return;
    }

    // CPUが牌を出した後、プレイヤーのターンに戻す
    // ただし、プレイヤーが「倒す」をできるようにする
    turn = "player";
}


/****************************************************
 * 場履歴ポップアップ
 ****************************************************/
const fieldArea = document.getElementById("field");
const popup = document.getElementById("fieldPopup");

fieldArea.addEventListener("mouseover", () => {
    if (fieldStack.length === 0) return;

    const text = fieldStack
        .map(set => "(" + set.map(cardText).join(",") + ")")
        .join(",");

    popup.textContent = text;
    popup.style.display = "block";
    popup.style.left = fieldArea.getBoundingClientRect().left + "px";
    popup.style.top  = (fieldArea.getBoundingClientRect().bottom + 5) + "px";
});

fieldArea.addEventListener("mouseout", () => {
    popup.style.display = "none";
});


/****************************************************
 * 起動
 ****************************************************/
window.onload = () => {
    deal();
    document.getElementById("playBtn").onclick = play;
    document.getElementById("passBtn").onclick = pass;
    document.getElementById("takeBtn").onclick = take;
};
/****************************************************
 * ゲーム開始
 ****************************************************/
function startGame(count) {
    playerCount = count;
    document.getElementById("playerCountSection").style.display = "none";
    document.getElementById("gameSection").style.display = "block";
    
    // 複数CPUの手札を初期化
    cpuHands = [];
    for (let i = 0; i < playerCount - 1; i++) {
        cpuHands.push([]);
    }
    
    deal();
}

