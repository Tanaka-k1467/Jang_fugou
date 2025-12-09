/****************************************************
 * online_all.js（完全統合版）
 * 
 * ▼含まれる処理
 * ・名前設定
 * ・ルーム作成 / 参加
 * ・ルーム退出（自動）
 * ・ゲーム開始（ホストのみ）
 * ・カード配布（27枚×2）
 * ・南面 / 革命 / 8切り
 * ・出す / パス / 倒す
 * ・勝敗判定 → ポップアップ
 * ・再戦 / ルーム解散
 * ・待機画面 ⇔ 対戦画面 自動スクロール
 ****************************************************/

// Firebase読み込み
import {
    getDatabase,
    ref,
    set,
    update,
    get,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const db = getDatabase();

let myId = "p_" + Math.floor(Math.random()*10000000);
let myName = "名無し";
let roomId = null;
let isHost = false;

// ゲーム状態
let hand = [];
let selected = [];
let field = [];
let fieldStack = [];
let isReversed = false;
let nanmenActive = false;
let lockedCount = 0;
let turn = null;

/****************************************************
 * UI：スクロール制御
 ****************************************************/
function scrollToSection(sectionId) {
    const sec = document.getElementById(sectionId);
    sec?.scrollIntoView({ behavior: "smooth" });
}

/****************************************************
 * 名前設定
 ****************************************************/
document.getElementById("setNameBtn").onclick = () => {
    const v = document.getElementById("playerNameInput").value.trim();
    if (!v) return alert("名前を入力してください");
    myName = v;

    if (roomId)
        update(ref(db, `rooms/${roomId}/players/${myId}`), { name: myName });

    alert("名前を設定しました");
};

/****************************************************
 * 4文字ルームID生成
 ****************************************************/
function generateRoomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random()*chars.length)]
    ).join("");
}

/****************************************************
 * ルーム作成
 ****************************************************/
document.getElementById("createRoomBtn").onclick = async() => {

    roomId = generateRoomId();
    const roomRef = ref(db, `rooms/${roomId}`);

    await set(roomRef, {
        status: "waiting",
        players: {},
        field: [],
        fieldStack: [],
        turn: null,
        turnOrder: {},
    });

    isHost = true;

    document.getElementById("roomIdText").textContent = "ルームID: " + roomId;
    document.getElementById("copyRoomIdBtn").style.display = "inline-block";
    document.getElementById("startGameBtn").style.display = "inline-block";

    alert("ルームを作成しました！");

    await joinRoom(roomId);

    scrollToSection("lobbySection");
};

/****************************************************
 * ルーム参加
 ****************************************************/
async function joinRoom(id) {
    roomId = id.trim();
    if (!roomId) return alert("ルームIDを入力してください");

    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        name: myName,
        hand: [],
        online: true
    });

    watchPlayers();
    watchStatus();
    watchDisconnect();

    alert("ルームに参加しました！");
}

document.getElementById("joinRoomBtn").onclick = () => {
    joinRoom(document.getElementById("joinRoomId").value);
};

/****************************************************
 * 相手が退出したか監視（ゲーム中なら勝ち）
 ****************************************************/
function watchDisconnect() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const players = snap.val() || {};

        if (!players[myId]) return; // 自分はいる

        const pids = Object.keys(players);

        // ゲーム中に1人だけ残った
        if (pids.length === 1 && players[myId].hand.length > 0) {
            showResultPopup(`${myName} の勝ち！（相手が退出）`);
        }
    });
}

/****************************************************
 * ルーム退出（タブ閉じなど）
 ****************************************************/
function setupAutoLeave() {
    if (!roomId) return;
    window.addEventListener("beforeunload", () => {
        remove(ref(db, `rooms/${roomId}/players/${myId}`));
    });
}
setupAutoLeave();

/****************************************************
 * プレイヤー一覧表示
 ****************************************************/
function watchPlayers() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const players = snap.val() || {};
        const area = document.getElementById("playerList");
        area.innerHTML = "<h3>参加プレイヤー：</h3>";

        for (const pid in players) {
            const div = document.createElement("div");
            div.textContent = `${players[pid].name} ${pid === myId ? "(あなた)" : ""}`;
            area.appendChild(div);
        }
    });
}

/****************************************************
 * ボタン：ルームIDコピー
 ****************************************************/
document.getElementById("copyRoomIdBtn").onclick = async() => {
    await navigator.clipboard.writeText(roomId);
    alert("コピーしました: " + roomId);
};

/****************************************************
 * ゲーム開始（ホストのみ）
 ****************************************************/
document.getElementById("startGameBtn").onclick = async() => {
    if (!isHost) return;

    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const players = snap.val() || {};
    const pids = Object.keys(players);

    if (pids.length !== 2) return alert("2人必要です");

    // ターン順
    const order = [...pids].sort(() => Math.random() - 0.5);

    // デッキ生成
    const deck = buildDeck();
    shuffle(deck);

    const h1 = deck.slice(0, 27);
    const h2 = deck.slice(27);

    await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        turnOrder: { 0: order[0], 1: order[1] },
        turn: order[0],
        field: [],
        fieldStack: [],
        lockedCount: 0,
        isReversed: false,
        nanmenActive: false
    });

    await update(ref(db, `rooms/${roomId}/players/${order[0]}`), { hand: h1 });
    await update(ref(db, `rooms/${roomId}/players/${order[1]}`), { hand: h2 });
};

/****************************************************
 * ゲーム開始 → 対戦画面へスクロール
 ****************************************************/
function watchStatus() {
    onValue(ref(db, `rooms/${roomId}/status`), snap => {
        if (snap.val() === "playing") {
            scrollToSection("playSection");
            listenGameState();
        }
    });
}

/****************************************************
 * デッキ生成（54枚）
 ****************************************************/
function buildDeck() {
    let d = [];

    for (let i=1; i<=9; i++)
        for (let j=0; j<4; j++) d.push(String(i));

    const winds = ["東","南","西","北"];
    for (let w of winds)
        for (let j=0; j<4; j++) d.push(w);

    d.push("赤","赤");

    return d;
}

function shuffle(a) {
    for (let i=a.length-1; i>0; i--) {
        const r = Math.floor(Math.random()*(i+1));
        [a[i], a[r]] = [a[r], a[i]];
    }
}

/****************************************************
 * 強さ
 ****************************************************/
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

function isStronger(a,b) {
    if (a === "赤" && b !== "赤") return true;
    if (b === "赤" && a !== "赤") return false;

    const sa = strengthBase(a);
    const sb = strengthBase(b);

    return isStrengthReversed() ? sa < sb : sa > sb;
}

/****************************************************
 * UI描画
 ****************************************************/
function cardText(v) { return v; }

function renderHand() {
    hand.sort((a,b)=> strengthBase(a)-strengthBase(b));

    const area = document.getElementById("hand");
    area.innerHTML = "";

    hand.forEach((v,i)=>{
        const d = document.createElement("div");
        d.className = "card";
        d.textContent = v;
        if (selected.includes(i)) d.classList.add("selected");
        d.onclick = ()=> toggleSelect(i);
        area.appendChild(d);
    });
}

function renderField() {
    const area = document.getElementById("field");
    area.innerHTML = "";

    field.forEach(v=>{
        const d = document.createElement("div");
        d.className = "card";
        d.textContent = "(" + v + ")";
        area.appendChild(d);
    });
}

/****************************************************
 * 選択
 ****************************************************/
function toggleSelect(i) {
    if (selected.includes(i))
        selected = selected.filter(x=>x!==i);
    else
        selected.push(i);
    renderHand();
}

/****************************************************
 * 出せる？
 ****************************************************/
function canPlay(cards) {
    if (cards.length === 0) return false;
    if (new Set(cards).size !== 1) return false;
    if (field.length === 0) return true;
    if (cards.length !== field.length) return false;
    return isStronger(cards[0], field[0]);
}

/****************************************************
 * 役判定
 ****************************************************/
function checkRevolution(cards) {
    if (cards.length !== 4) return false;
    if (new Set(cards).size === 1) return true;
    const sorted = cards.slice().sort();
    return JSON.stringify(sorted) === JSON.stringify(["東","南","西","北"]);
}

function checkNanmen(cards) {
    return cards.includes("南");
}

function checkEightCut(cards) {
    return cards.includes("8");
}

/****************************************************
 * 出す
 ****************************************************/
window.playOnline = async () => {
    if (turn !== myId) return alert("あなたのターンではありません");

    const cards = selected.map(i=> hand[i]);
    cards.sort((a,b)=> strengthBase(a)-strengthBase(b));

    if (!canPlay(cards)) return alert("出せません");

    const rev = checkRevolution(cards);
    const nan = checkNanmen(cards);
    const eight = checkEightCut(cards);

    const newNanmen = nan || nanmenActive;

    // 場更新
    await update(ref(db, `rooms/${roomId}`), {
        field: cards,
        fieldStack: [...fieldStack, cards],
        lockedCount: cards.length,
        nanmenActive: newNanmen,
        isReversed: rev ? !isReversed : isReversed
    });

    // 手札から削除
    const newHand = hand.filter((_,idx)=> !selected.includes(idx));
    selected = [];
    await update(ref(db, `rooms/${roomId}/players/${myId}`), { hand: newHand });

    // 8切り
    if (eight) {
        await update(ref(db,`rooms/${roomId}`),{
            field: [],
            fieldStack: [],
            lockedCount: 0,
            nanmenActive: false
        });
        await moveTurn(myId);
        return;
    }

    await moveTurn();

    // 勝利判定
    if (newHand.length === 0)
        showResultPopup(`${myName} の勝ち！`);
};

/****************************************************
 * パス
 ****************************************************/
window.passOnline = async () => {
    if (turn !== myId) return alert("あなたのターンではありません");

    await update(ref(db,`rooms/${roomId}`),{
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });

    await moveTurn();
};

/****************************************************
 * 倒す
 ****************************************************/
window.takeOnline = async () => {
    if (turn !== myId) return alert("あなたのターンではありません");
    if (field.length === 0) return alert("倒す場がありません");

    const newHand = [...hand, ...field];

    await update(ref(db,`rooms/${roomId}/players/${myId}`),{
        hand: newHand
    });

    await update(ref(db,`rooms/${roomId}`),{
        field: [],
        fieldStack: [],
        lockedCount: 0,
        nanmenActive: false
    });
};

/****************************************************
 * ターン移動（2人）
 ****************************************************/
async function moveTurn(forceSelf=null) {
    const snap = await get(ref(db,`rooms/${roomId}`));
    const data = snap.val();

    const order = Object.values(data.turnOrder);
    const current = data.turn;

    let next;

    if (forceSelf) next = forceSelf;
    else next = order.find(pid => pid !== current);

    await update(ref(db,`rooms/${roomId}`),{
        turn: next
    });
}

/****************************************************
 * Firebase ゲーム状態監視
 ****************************************************/
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

/****************************************************
 * 結果ポップアップ
 ****************************************************/
function showResultPopup(text) {
    document.getElementById("resultText").textContent = text;
    document.getElementById("resultPopup").style.display = "block";
}

/****************************************************
 * 再戦
 ****************************************************/
document.getElementById("restartBtn").onclick = () => {
    if (!isHost) return alert("ホストのみできます");

    // もう一度初期状態へ戻す
    update(ref(db,`rooms/${roomId}`),{
        status: "waiting",
        field: [],
        fieldStack: [],
        turn: null,
        turnOrder: {}
    });

    document.getElementById("resultPopup").style.display = "none";
    scrollToSection("lobbySection");
};

/****************************************************
 * ルーム解散
 ****************************************************/
document.getElementById("closeRoomBtn").onclick = async () => {
    await remove(ref(db, `rooms/${roomId}`));
    alert("ルームを解散しました！");
    location.href = "index.html";
};
