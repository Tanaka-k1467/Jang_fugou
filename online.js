/* ============================================================
   online.js（完全書き換え版）
   ・名前設定
   ・ルーム作成 / 参加
   ・ホストのみ開始
   ・プレイヤーリスト監視
   ・ステータス変更で自動スクロール
   ・退室検知
============================================================ */

import {
    getDatabase,
    ref,
    set,
    update,
    onValue,
    get,
    remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const db = getDatabase();

/* ============================================================
   参加プレイヤー情報
============================================================ */
export let myId = "p_" + Math.floor(Math.random() * 10000000);
export let myName = "名無し";
let roomId = null;
let isHost = false;

/* ============================================================
   スムーズスクロール（null 安全版）
============================================================ */
function safeScroll(id) {
    setTimeout(() => {
        const elem = document.getElementById(id);
        if (elem) elem.scrollIntoView({ behavior: "smooth" });
    }, 50);
}

/* ============================================================
   名前設定
============================================================ */
document.getElementById("setNameBtn").onclick = () => {
    const input = document.getElementById("playerNameInput").value.trim();
    if (!input) return alert("名前を入力してください");
    myName = input;

    if (roomId) {
        update(ref(db, `rooms/${roomId}/players/${myId}`), {
            name: myName
        });
    }
    alert(`名前を ${myName} に設定しました`);
};

/* ============================================================
   ルームID生成（4桁英数字）
============================================================ */
function generateRoomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

/* ============================================================
   ルーム作成
============================================================ */
document.getElementById("createRoomBtn").onclick = async () => {
    roomId = generateRoomId();
    isHost = true;

    const baseRef = ref(db, `rooms/${roomId}`);
    await set(baseRef, {
        status: "waiting",
        players: {},
        field: [],
        fieldStack: [],
        turn: null,
        turnOrder: {}
    });

    document.getElementById("roomIdText").textContent = "ルームID: " + roomId;
    document.getElementById("copyRoomIdBtn").style.display = "inline-block";
    document.getElementById("startGameBtn").style.display = "inline-block";

    alert("ルームを作成しました！");

    joinRoom(roomId);
};

/* ============================================================
   ルーム参加
============================================================ */
document.getElementById("joinRoomBtn").onclick = () => {
    const id = document.getElementById("joinRoomId").value.trim();
    if (!id) return alert("ルームIDを入力してください");
    joinRoom(id);
};

async function joinRoom(id) {
    roomId = id;

    // プレイヤー登録
    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        name: myName,
        hand: []
    });

    alert("ルームに参加しました！");
    watchPlayers();
    watchStatus();
    watchRoomDisconnect();
}

/* ============================================================
   プレイヤー一覧表示
============================================================ */
function watchPlayers() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const players = snap.val() || {};
        const area = document.getElementById("playerList");
        area.innerHTML = "<h3>参加プレイヤー：</h3>";

        for (const pid in players) {
            const name = players[pid].name ?? "名無し";
            const div = document.createElement("div");
            div.textContent = `${name}${pid === myId ? " (あなた)" : ""}`;
            area.appendChild(div);
        }

        // 対戦中で相手が抜けた → 勝利扱い
        const pcount = Object.keys(players).length;
        get(ref(db, `rooms/${roomId}/status`)).then(snap => {
            if (snap.val() === "playing" && pcount === 1) {
                alert("相手が退出しました — あなたの勝ちです！");
            }
        });
    });
}

/* ============================================================
   ゲーム開始（ホストのみ）
============================================================ */
document.getElementById("startGameBtn").onclick = async () => {
    if (!isHost) return alert("ホストのみ開始できます");

    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const players = snap.val() || {};
    const pids = Object.keys(players);

    if (pids.length !== 2)
        return alert("2人揃っていません（今は2人専用）");

    // ランダムに順番を決める
    const shuffled = [...pids].sort(() => Math.random() - 0.5);
    const first = shuffled[0];

    await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        turnOrder: { 0: shuffled[0], 1: shuffled[1] },
        turn: first
    });
};

/* ============================================================
   ステータス監視 → 自動スクロール
============================================================ */
function watchStatus() {
    onValue(ref(db, `rooms/${roomId}/status`), snap => {
        const st = snap.val();
        if (!st) return;

        console.log("status =", st);

        if (st === "waiting") safeScroll("lobbySection");
        if (st === "playing") safeScroll("playSection");
    });
}

/* ============================================================
   ルームIDコピー
============================================================ */
document.getElementById("copyRoomIdBtn").onclick = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    alert("コピーしました: " + roomId);
};

/* ============================================================
   自動退室処理（タブ閉じ・離脱検知）
============================================================ */
function watchRoomDisconnect() {
    window.addEventListener("beforeunload", () => {
        if (!roomId) return;
        remove(ref(db, `rooms/${roomId}/players/${myId}`));
    });
}
