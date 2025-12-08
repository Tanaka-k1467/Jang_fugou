/************************************************************
 * onlinemain.js  — オンライン対戦バトル本体
 * ・南面：南が場にある間だけ反転
 * ・革命：永続（革命返しで戻る）
 * ・8切り：流して出した本人のターン続行
 * ・倒す：場を手札に加える
 * ・勝利判定 → Firebase に finished をセット
 ************************************************************/

import {
    getDatabase,
    ref,
    update,
    onValue,
    get
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const db = getDatabase();

let roomId = null;
let myId = null;
let myName = "名無し";

let hand = [];
let selected = [];
let field = [];
let fieldStack = [];
let isReversed = false;
let nanmenActive = false;
let lockedCount = 0;
let turn = null;

/************************************************************
 * 初期化（online.js → online_play.html → onlinemain.js）
 ************************************************************/
window.onlineGameInit = function(id, rid, name) {
    myId = id;
    roomId = rid;
    myName = name;

    listenGameState();
};


/************************************************************
 * 強さ判定
 ************************************************************/
function strengthBase(v) {
    if (v === "赤") return 999;    // ★ 赤は常に最強
    if (v === "2") return 13;
    if (v === "1") return 12;
    if (v === "北") return 11;
    if (v === "西") return 10;
    if (v === "南") return 9;
    if (v === "東") return 8;
    return Number(v) - 2;
}

function isStrengthReversed() {
    return nanmenActive ^ isReversed;
}

function isStronger(a, b) {
    if (a === "赤" && b !== "赤") return true;
    if (b === "赤" && a !== "赤") return false;

    const sa = strengthBase(a);
    const sb = strengthBase(b);
    return isStrengthReversed() ? sa < sb : sa > sb;
}


/************************************************************
 * UI描画
 ************************************************************/
function cardText(v) {
    return v;
}

function renderHand() {
    const area = document.getElementById("hand");
    area.innerHTML = "";

    hand.sort((a, b) => strengthBase(a) - strengthBase(b));

    hand.forEach((v, i) => {
        const d = document.createElement("div");
        d.className = "card";
        d.textContent = cardText(v);
        if (selected.includes(i)) d.classList.add("selected");
        d.onclick = () => toggleSelect(i);
        area.appendChild(d);
    });
}

function renderField() {
    const area = document.getElementById("field");
    area.innerHTML = "";
    field.forEach(v => {
        const d = document.createElement("div");
        d.className = "card";
        d.textContent = `(${v})`;
        area.appendChild(d);
    });
}


/************************************************************
 * 選択操作
 ************************************************************/
function toggleSelect(i) {
    if (selected.includes(i)) {
        selected = selected.filter(x => x !== i);
    } else {
        selected.push(i);
    }
    renderHand();
}


/************************************************************
 * 出せるか判定
 ************************************************************/
function canPlay(cards) {
    if (cards.length === 0) return false;

    if (new Set(cards).size !== 1) return false;

    if (field.length === 0) return true;

    if (cards.length !== field.length) return false;

    return isStronger(cards[0], field[0]);
}


/************************************************************
 * 特殊判定
 ************************************************************/
function checkRevolution(cards) {
    if (cards.length !== 4) return false;
    if (new Set(cards).size === 1) return true;

    return JSON.stringify(cards.slice().sort()) === JSON.stringify(["東","南","西","北"]);
}

function checkNanmen(cards) {
    return cards.includes("南");
}

function checkEightCut(cards) {
    return cards.includes("8");
}


/************************************************************
 * ★ 出す（play）
 ************************************************************/
async function pushPlay(cards) {
    const roomRef = ref(db, `rooms/${roomId}`);

    const rev = checkRevolution(cards);
    const nan = checkNanmen(cards);
    const eight = checkEightCut(cards);

    const newNanmen = nan || nanmenActive;

    // 場更新
    await update(roomRef, {
        field: cards,
        fieldStack: [...fieldStack, cards],
        lockedCount: cards.length,
        nanmenActive: newNanmen,
        isReversed: rev ? !isReversed : isReversed
    });

    // 手札削除
    const newHand = hand.filter((_, idx) => !selected.includes(idx));
    selected = [];

    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        hand: newHand
    });

    // 勝敗判定
    if (newHand.length === 0) {
        await update(ref(db, `rooms/${roomId}`), {
            status: "finished",
            winner: myName
        });
        return;
    }

    // ★ 8切り → 場流し＆自分のターン続行
    if (eight) {
        await update(roomRef, {
            field: [],
            fieldStack: [],
            lockedCount: 0,
            nanmenActive: false
        });

        await moveTurn(myId);
        return;
    }

    await moveTurn();
}


/************************************************************
 * ★ ターン移動
 ************************************************************/
async function moveTurn(forceTo = null) {
    const snap = await get(ref(db, `rooms/${roomId}`));
    const data = snap.val();

    const order = Object.values(data.turnOrder);
    const current = data.turn;

    let next;

    if (forceTo) next = forceTo;
    else next = order.find(pid => pid !== current);

    await update(ref(db, `rooms/${roomId}`), { turn: next });
}


/************************************************************
 * パス（場流し）
 ************************************************************/
async function pushPass() {
    await update(ref(db, `rooms/${roomId}`), {
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });

    moveTurn();
}


/************************************************************
 * 倒す（場を取る）
 ************************************************************/
async function pushTake() {
    const newHand = [...hand, ...field];

    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        hand: newHand
    });

    await update(ref(db, `rooms/${roomId}`), {
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });
}


/************************************************************
 * ★ Firebaseゲーム同期
 ************************************************************/
function listenGameState() {
    onValue(ref(db, `rooms/${roomId}`), snap => {
        const data = snap.val();
        if (!data) return;

        field = data.field || [];
        fieldStack = data.fieldStack || [];
        isReversed = data.isReversed || false;
        nanmenActive = data.nanmenActive || false;
        lockedCount = data.lockedCount || 0;
        turn = data.turn || null;

        const me = data.players?.[myId];
        if (me) hand = me.hand || [];

        renderHand();
        renderField();
    });
}


/************************************************************
 * ボタン呼び出し
 ************************************************************/
window.playOnline = function() {
    if (turn !== myId) return alert("あなたのターンではありません");

    const cards = selected.map(i => hand[i]);

    cards.sort((a, b) => strengthBase(a) - strengthBase(b));

    if (!canPlay(cards)) return alert("出せません");

    pushPlay(cards);
};

window.passOnline = function() {
    if (turn !== myId) return alert("あなたのターンではありません");
    pushPass();
};

window.takeOnline = function() {
    if (turn !== myId) return alert("あなたのターンではありません");
    if (field.length === 0) return alert("倒す場がありません");
    pushTake();
};
