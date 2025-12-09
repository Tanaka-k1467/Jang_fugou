/* ============================================================
   Firebase 初期化
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    update,
    onValue,
    get,
    remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCiC3YczfiCXajLy8swS9RtShw5BpBKQwQ",
    authDomain: "jang-fugou.firebaseapp.com",
    projectId: "jang-fugou",
    storageBucket: "jang-fugou.firebasestorage.app",
    messagingSenderId: "1083704368390",
    appId: "1:1083704368390:web:f6b6aa0b42508182f41287",
    databaseURL: "https://jang-fugou-default-rtdb.firebaseio.com"
};

initializeApp(firebaseConfig);
const db = getDatabase();

/* ============================================================
   グローバル変数
============================================================ */
let myId = "p_" + Math.floor(Math.random() * 10000000);
let myName = "名無し";
let roomId = null;
let isHost = false;

let hand = [];
let selected = [];
let field = [];
let fieldStack = [];
let isReversed = false;
let nanmenActive = false;
let lockedCount = 0;
let turn = null;

/* ============================================================
   DOM 取得
============================================================ */
const lobbySection = document.getElementById("lobbySection");
const playSection = document.getElementById("playSection");

playSection.style.display = "none";

/* ============================================================
   UI 基本関数
============================================================ */
function renderHand() {
    const area = document.getElementById("hand");
    area.innerHTML = "";

    hand.forEach((v, i) => {
        const el = document.createElement("div");
        el.className = "card";
        el.textContent = v;

        if (selected.includes(i)) el.classList.add("selected");

        el.onclick = () => {
            if (selected.includes(i))
                selected = selected.filter(x => x !== i);
            else
                selected.push(i);
            renderHand();
        };

        area.appendChild(el);
    });
}

function renderField() {
    const area = document.getElementById("field");
    area.innerHTML = "";
    field.forEach(v => {
        const el = document.createElement("div");
        el.className = "card";
        el.textContent = v;
        area.appendChild(el);
    });
}

function scrollToPlay() {
    playSection.style.display = "block";
    playSection.scrollIntoView({ behavior: "smooth" });
}

/* ============================================================
   強さ判定
============================================================ */
function strengthBase(v) {
    if (v === "赤") return 999;
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

function canPlay(cards) {
    if (cards.length === 0) return false;
    if (new Set(cards).size !== 1) return false;
    if (field.length === 0) return true;
    if (cards.length !== field.length) return false;
    return isStronger(cards[0], field[0]);
}

/* ============================================================
   特殊役
============================================================ */
function checkRevolution(cards) {
    if (cards.length !== 4) return false;
    if (new Set(cards).size === 1) return true;

    const sorted = [...cards].sort();
    return JSON.stringify(sorted) === JSON.stringify(["東", "南", "西", "北"]);
}

function checkNanmen(cards) {
    return cards.includes("南");
}

function checkEightCut(cards) {
    return cards.includes("8");
}

/* ============================================================
   出す / パス / 倒す
============================================================ */
async function pushPlay(cards) {
    const roomRef = ref(db, `rooms/${roomId}`);

    const rev = checkRevolution(cards);
    const nan = checkNanmen(cards);
    const eight = checkEightCut(cards);

    const newNan = nan || nanmenActive;

    await update(roomRef, {
        field: cards,
        fieldStack: [...fieldStack, cards],
        lockedCount: cards.length,
        nanmenActive: newNan,
        isReversed: rev ? !isReversed : isReversed,
    });

    const newHand = hand.filter((_, idx) => !selected.includes(idx));
    selected = [];

    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        hand: newHand
    });

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

async function moveTurn(forceTo = null) {
    const snap = await get(ref(db, `rooms/${roomId}`));
    const data = snap.val();

    const order = Object.values(data.turnOrder);
    const current = data.turn;

    let next = forceTo ?? order.find(pid => pid !== current);

    await update(ref(db, `rooms/${roomId}`), {
        turn: next
    });
}

async function pushPass() {
    await update(ref(db, `rooms/${roomId}`), {
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });

    moveTurn();
}

async function pushTake() {
    const newHand = [...hand, ...field];

    await update(ref(db, `rooms/${roomId}/players/${myId}`), { hand: newHand });

    await update(ref(db, `rooms/${roomId}`), {
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });
}

/* ============================================================
   ゲーム進行監視
============================================================ */
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

        if (data.status === "playing") scrollToPlay();
    });
}

/* ============================================================
   ルーム関連
============================================================ */
async function joinRoom(id) {
    roomId = id;

    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        name: myName,
        hand: []
    });

    watchPlayers();
    watchStatus();
}

function watchPlayers() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const players = snap.val() || {};
        const area = document.getElementById("playerList");
        area.innerHTML = "<h3>参加プレイヤー：</h3>";

        for (const pid in players) {
            const div = document.createElement("div");
            div.textContent = `${players[pid].name}${pid === myId ? " (あなた)" : ""}`;
            area.appendChild(div);
        }

        // 対戦中に他方が抜けたら勝利
        if (roomId && Object.keys(players).length === 1) {
            showResult(`${myName} の勝利！（相手が退出）`);
        }
    });
}

function watchStatus() {
    onValue(ref(db, `rooms/${roomId}/status`), snap => {
        const st = snap.val();
        if (st === "playing") {
            scrollToPlay();
            listenGameState();
        }
    });
}

/* ============================================================
   結果表示
============================================================ */
function showResult(text) {
    document.getElementById("resultText").textContent = text;
    document.getElementById("resultBg").style.display = "block";
    document.getElementById("resultPopup").style.display = "block";
}

/* ============================================================
   イベント登録
============================================================ */
document.getElementById("copyRoomIdBtn").onclick = () => {
    navigator.clipboard.writeText(roomId);
    alert("コピーしました: " + roomId);
};

document.getElementById("setNameBtn").onclick = () => {
    const val = document.getElementById("playerNameInput").value.trim();
    if (!val) return alert("名前を入力してください");
    myName = val;
    if (roomId)
        update(ref(db, `rooms/${roomId}/players/${myId}`), { name: myName });
};

document.getElementById("createRoomBtn").onclick = async () => {
    roomId = generateRoomId();
    isHost = true;

    await set(ref(db, `rooms/${roomId}`), {
        status: "waiting",
        players: {},
        field: [],
        fieldStack: [],
        turn: null,
        turnOrder: {}
    });

    document.getElementById("roomIdText").textContent = roomId;
    document.getElementById("copyRoomIdBtn").style.display = "inline-block";
    document.getElementById("startGameBtn").style.display = "block";

    joinRoom(roomId);
};

document.getElementById("joinRoomBtn").onclick = () => {
    const id = document.getElementById("joinRoomId").value.trim();
    joinRoom(id);
};

document.getElementById("startGameBtn").onclick = async () => {
    if (!isHost) return alert("ホストのみ開始できます");

    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const players = snap.val() || {};
    const ids = Object.keys(players);

    if (ids.length !== 2) return alert("今は2人専用です");

    const shuffled = [...ids].sort(() => Math.random() - 0.5);

    await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        turnOrder: { 0: shuffled[0], 1: shuffled[1] },
        turn: shuffled[0]
    });
};

document.getElementById("playBtn").onclick = () => {
    const cards = selected.map(i => hand[i]);
    if (!canPlay(cards)) return alert("出せません");
    pushPlay(cards);
};

document.getElementById("passBtn").onclick = () => {
    pushPass();
};

document.getElementById("takeBtn").onclick = () => {
    if (field.length === 0) return alert("倒す場がない");
    pushTake();
};

document.getElementById("closeRoomBtn").onclick = async () => {
    await remove(ref(db, `rooms/${roomId}`));
    location.href = "index.html";
};

document.getElementById("restartBtn").onclick = () => {
    location.reload();
};

document.getElementById("backHomeBtn").onclick = () => {
    location.href = "index.html";
};

/* ============================================================
   小物
============================================================ */
function generateRoomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}
