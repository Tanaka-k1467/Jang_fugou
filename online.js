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
   デッキ管理
============================================================ */
function createDeck() {
    const d = [];
    // 数字牌（1-9）を各4枚 = 36枚
    for (let i = 1; i <= 9; i++)
        for (let j = 0; j < 4; j++) d.push(i);
    // 風牌（10-13）を各4枚 = 16枚
    for (let i = 10; i <= 13; i++)
        for (let j = 0; j < 4; j++) d.push(i);
    // 赤牌（99）を2枚 = 2枚
    // 合計: 36 + 16 + 2 = 54枚
    // 108枚にするため、全て2倍にする
    d.push(99, 99);
    // デッキを2倍にして108枚にする
    return [...d, ...d];
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [a[i], a[r]] = [a[r], a[i]];
    }
    return a;
}

function strengthBase(v) {
    if (v === 99) return 14;
    if (v === 2) return 13;
    if (v === 1) return 12;
    if (v === 13) return 11;
    if (v === 12) return 10;
    if (v === 11) return 9;
    if (v === 10) return 8;
    return v - 2;
}

/* ============================================================
   UI 基本関数
============================================================ */
function cardText(v) {
    if (v === 99 || v === "赤") return "赤";
    if (v === 2 || v === "2") return "2";
    if (v === 1 || v === "1") return "1";
    if (v === 13 || v === "北") return "北";
    if (v === 12 || v === "西") return "西";
    if (v === 11 || v === "南") return "南";
    if (v === 10 || v === "東") return "東";
    return String(v);
}

function renderHand() {
    const area = document.getElementById("hand");
    area.innerHTML = "";

    hand.forEach((v, i) => {
        const el = document.createElement("div");
        el.className = "card";
        el.textContent = cardText(v);

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
        el.textContent = "(" + cardText(v) + ")";
        area.appendChild(el);
    });
}

function scrollToPlay() {
    playSection.style.display = "block";
    playSection.scrollIntoView({ behavior: "smooth" });
}

function isStrengthReversed() {
    return nanmenActive ^ isReversed;
}

function isStronger(a, b) {
    // 赤牌（99）は常に最強
    if (a === 99) return true;
    if (b === 99) return false;
    
    // 赤牌以外で比較
    const sa = strengthBase(a);
    const sb = strengthBase(b);

    return isStrengthReversed() ? sa < sb : sa > sb;
}

function canPlay(cards) {
    // ターン判定
    if (turn !== myId) return false;
    
    if (cards.length === 0) return false;
    
    // 赤牌を含む場合の処理
    const nonRedCards = cards.filter(c => c !== 99);
    const redCount = cards.length - nonRedCards.length;
    
    // 赤牌のみの場合
    if (nonRedCards.length === 0) {
        // 赤牌のみは常に出せる（99として扱う）
        if (field.length === 0) return true;
        if (cards.length !== field.length) return false;
        // 赤牌は常に最強なので、99として比較
        return isStronger(99, field[0]);
    }
    
    // 赤牌以外の牌が全て同じ値か確認
    if (new Set(nonRedCards).size !== 1) return false;
    
    // 場が空の場合は出せる
    if (field.length === 0) return true;
    
    // 枚数が同じか確認
    if (cards.length !== field.length) return false;
    
    // 強さ比較（赤牌を含む場合、赤牌以外の牌で比較）
    return isStronger(nonRedCards[0], field[0]);
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
    // 南（11）が含まれているか判定
    return cards.some(c => c === 11);
}

function checkEightCut(cards) {
    return cards.includes(8);
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

    const order = Array.isArray(data.turnOrder) ? data.turnOrder : Object.values(data.turnOrder);
    const current = data.turn;

    let next;
    if (forceTo) {
        next = forceTo;
    } else {
        const currentIndex = order.indexOf(current);
        const nextIndex = (currentIndex + 1) % order.length;
        next = order[nextIndex];
    }

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

function canTake() {
    if (field.length === 0) return false;
    if (fieldStack.length === 0) return false;
    
    const fieldStages = fieldStack.length;
    const requiredStages = lockedCount + 1;
    
    return fieldStages >= requiredStages;
}

async function pushTake() {
    if (!canTake()) {
        const fieldStages = fieldStack.length;
        const requiredStages = lockedCount + 1;
        return alert(`倒すには場に${requiredStages}段以上の牌が必要です（現在：${fieldStages}段）`);
    }
    
    const newHand = [...hand, ...field];

    await update(ref(db, `rooms/${roomId}/players/${myId}`), { hand: newHand });

    await update(ref(db, `rooms/${roomId}`), {
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });
    
    await moveTurn(myId);
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
        updateTurnDisplay();
        
        // ゲーム終了判定（ゲーム開始後かつ全プレイヤーの手牌が配られている場合のみ）
        if (data.status === "playing") {
            const players = data.players || {};
            let allPlayersHaveCards = true;
            let winnerName = null;
            
            // 全プレイヤーの手牌を確認
            for (const pid in players) {
                const playerHand = players[pid].hand || [];
                if (playerHand.length === 0 && pid !== myId) {
                    winnerName = players[pid].name || "名無し";
                }
                if (playerHand.length === 0) {
                    allPlayersHaveCards = false;
                }
            }
            
            // 全プレイヤーの手牌が配られている場合のみ勝利判定を実行
            if (allPlayersHaveCards && hand.length > 0) {
                // 他のプレイヤーが上がった
                if (winnerName) {
                    showResult(`${winnerName}が上がりました。あなたの敗北です。`);
                    return;
                }
                
                // 自分が上がった
                if (hand.length === 0) {
                    showResult(`あなたが上がりました。勝利です！`);
                    return;
                }
            }
        }

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

        // 対戦中に他方が抜けたら勝利（ゲーム開始後のみ）
        if (roomId && Object.keys(players).length === 1 && playSection.style.display !== "none") {
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
    const playerIds = Object.keys(players);

    if (playerIds.length < 2) return alert("ゲームを開始するには2人以上が必要です");

    // ターン順序をシャッフル
    const turnOrder = [...playerIds].sort(() => Math.random() - 0.5);
    console.log("ターン順序:", turnOrder);

    // 手牌を配布
    const deck = shuffle(createDeck());
    const cardsPerPlayer = Math.floor(108 / turnOrder.length);
    
    const playerUpdates = {};
    for (let i = 0; i < turnOrder.length; i++) {
        const playerId = turnOrder[i];
        const start = i * cardsPerPlayer;
        const end = (i === turnOrder.length - 1) ? deck.length : (i + 1) * cardsPerPlayer;
        const playerHand = deck.slice(start, end).sort((a, b) => strengthBase(a) - strengthBase(b));
        
        console.log(`プレイヤー${i} (${playerId}): ${playerHand.length}枚 (${start}-${end})`);
        playerUpdates[`players/${playerId}/hand`] = playerHand;
    }

    // ルーム情報を更新（ゲーム開始）
    await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        turnOrder: turnOrder,
        turn: turnOrder[0]
    });

    // 各プレイヤーの手牌を個別に更新
    for (const playerId in playerUpdates) {
        const handPath = `rooms/${roomId}/players/${playerId}/hand`;
        await update(ref(db, handPath), playerUpdates[playerId]);
    }
    
    console.log("ゲーム開始");
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
    isRestarting = true;
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

/* ============================================================
   ページ離脱時の処理
============================================================ */
// タブを閉じた時だけプレイヤーを削除
async function removePlayerOnExit() {
    // もう一度遊ぶの場合はプレイヤーを削除しない
    if (isRestarting) return;
    
    if (roomId && myId) {
        try {
            await remove(ref(db, `rooms/${roomId}/players/${myId}`));
        } catch (e) {
            console.error('Failed to remove player on exit:', e);
        }
    }
}

window.addEventListener('beforeunload', removePlayerOnExit);
window.addEventListener('pagehide', removePlayerOnExit);
/* ============================================================
   ターン情報更新
============================================================ */
function updateTurnDisplay() {
    const turnDisplay = document.getElementById("turnDisplay");
    if (!turnDisplay) return;
    
    get(ref(db, `rooms/${roomId}/players`)).then(snap => {
        const data = snap.val();
        if (!data) return;
        
        const players = {};
        for (const pid in data) {
            players[pid] = data[pid].name || "名無し";
        }
        
        const currentPlayerName = players[turn] || "ー";
        const otherPlayerId = Object.keys(players).find(p => p !== myId);
        const nextPlayerName = turn === myId ? (players[otherPlayerId] || "ー") : (players[myId] || "ー");
        
        turnDisplay.textContent = `現在のターン：${currentPlayerName}\n次：${nextPlayerName}`;
    }).catch(e => console.error("Turn display error:", e));
}
/****************************************************
 * 次のプレイヤーのターンに進む
 ****************************************************/
function getNextPlayer(players, currentPlayerId) {
    const ids = Object.keys(players).sort();
    const currentIndex = ids.indexOf(currentPlayerId);
    const nextIndex = (currentIndex + 1) % ids.length;
    return ids[nextIndex];
}

