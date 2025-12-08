/****************************************************
 * online.js（完全版）
 * ・待機画面とゲーム開始処理
 * ・対戦中に相手が抜けたら残った方の勝ち
 * ・待機中に抜けても何もしない
 * ・ルーム作成 → join の順でメッセージ順序バグ修正
 * ・ルームIDコピー機能修正
 ****************************************************/

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

/**********************
 * Firebase 初期設定
 **********************/
const firebaseConfig = {
    apiKey: "AIzaSyCiC3YczfiCXajLy8swS9RtShw5BpBKQwQ",
    authDomain: "jang-fugou.firebaseapp.com",
    projectId: "jang-fugou",
    storageBucket: "jang-fugou.firebasestorage.app",
    messagingSenderId: "1083704368390",
    appId: "1:1083704368390:web:f6b6aa0b42508182f41287",
    measurementId: "G-WTYGK3TB63",
    databaseURL: "https://jang-fugou-default-rtdb.firebaseio.com"
};

initializeApp(firebaseConfig);
const db = getDatabase();

/**********************
 * プレイヤー情報
 **********************/
export let myId = "p_" + Math.floor(Math.random() * 10000000);
export let myName = "名無し";
let roomId = null;
let isHost = false;

let lastPlayerCount = 0; // ★抜け判定用

/**********************
 * 名前設定
 **********************/
document.getElementById("setNameBtn").onclick = () => {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) return alert("名前を入力してください");
    myName = name;

    if (roomId) update(ref(db, `rooms/${roomId}/players/${myId}`), { name: myName });

    alert(`名前を ${myName} に設定しました`);
};

/**********************
 * 4桁ルームID生成
 **********************/
function generateRoomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

/**********************
 * ルーム作成
 **********************/
document.getElementById("createRoomBtn").onclick = async () => {

    roomId = generateRoomId();
    const baseRef = ref(db, `rooms/${roomId}`);

    // 先に部屋枠だけ作る（メッセージ順維持のため）
    await set(baseRef, {
        status: "waiting",
        players: {},
        field: [],
        fieldStack: [],
        turn: null,
        turnOrder: {}
    });

    isHost = true;

    document.getElementById("roomIdText").textContent = "ルームID: " + roomId;
    document.getElementById("copyRoomIdBtn").style.display = "inline-block";
    document.getElementById("startGameBtn").style.display = "inline-block";

    // ★ join を先に呼ぶ（メッセージ順修正）
    await joinRoom(roomId);

    alert("ルームを作成しました！");
};

/**********************
 * ルーム参加
 **********************/
async function joinRoom(id) {
    roomId = id.trim();
    if (!roomId) return alert("ルームIDを入力してください");

    // 参加情報
    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        name: myName,
        hand: []
    });

    watchPlayers();
    watchStatus();
}

/**********************
 * 参加ボタン
 **********************/
document.getElementById("joinRoomBtn").onclick = () => {
    joinRoom(document.getElementById("joinRoomId").value);
};

/**********************
 * プレイヤー一覧
 **********************/
function watchPlayers() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const players = snap.val() || {};
        const pids = Object.keys(players);
        const count = pids.length;

        const area = document.getElementById("playerList");
        area.innerHTML = "<h3>参加プレイヤー：</h3>";

        for (const pid in players) {
            const name = players[pid].name ?? "名無し";
            const div = document.createElement("div");
            div.textContent = `${name} ${pid === myId ? "(あなた)" : ""}`;
            area.appendChild(div);
        }

        // ★ 人が減った → 対戦中なら勝敗処理へ
        if (lastPlayerCount === 2 && count === 1) {
            checkDisconnectWinner(players);
        }

        lastPlayerCount = count;
    });
}

/**********************
 * 対戦中に抜けた → 勝敗処理
 **********************/
function checkDisconnectWinner(players) {
    get(ref(db, `rooms/${roomId}/status`)).then(snap => {
        const status = snap.val();

        // 待機中なら何もしない
        if (status !== "playing") return;

        // プレイヤーが残っているなら勝ち
        if (players[myId]) {
            alert("相手が退出したため、あなたの勝ちです！");
        }

        // 部屋をリセットして待機状態に戻す
        update(ref(db, `rooms/${roomId}`), {
            status: "waiting",
            field: [],
            fieldStack: [],
            turn: null,
            lockedCount: 0,
            nanmenActive: false,
            isReversed: false
        });
    });
}

/**********************
 * ゲーム開始（ホスト）
 **********************/
document.getElementById("startGameBtn").onclick = async () => {
    if (!isHost) return alert("ホストのみ開始できます");

    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const players = snap.val() || {};
    const pids = Object.keys(players);

    if (pids.length !== 2) return alert("今は2人専用です");

    const shuffled = [...pids].sort(() => Math.random() - 0.5);
    const first = shuffled[0];

    await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        turnOrder: { 0: shuffled[0], 1: shuffled[1] },
        turn: first
    });
};

/**********************
 * ゲーム開始を検知 → プレイ画面へスクロール
 **********************/
function watchStatus() {
    onValue(ref(db, `rooms/${roomId}/status`), snap => {
        const status = snap.val();
        if (status === "playing") {
            document.getElementById("waitScreen").style.display = "none";
            document.getElementById("playScreen").style.display = "block";

            // 上へスクロール
            window.scrollTo({ top: 0, behavior: "smooth" });

            // onlinemain.js の初期化を呼ぶ
            if (window.onlineGameInit) {
                window.onlineGameInit(myId, roomId, myName);
            }
        }
    });
}

/**********************
 * ルームIDコピー
 **********************/
document.getElementById("copyRoomIdBtn").onclick = () => {
    navigator.clipboard.writeText(roomId)
        .then(() => alert("コピーしました: " + roomId))
        .catch(() => alert("コピーに失敗しました"));
};

/**********************
 * ページ離脱時 → 自動退出
 **********************/
window.addEventListener("beforeunload", () => {
    if (!roomId) return;
    remove(ref(db, `rooms/${roomId}/players/${myId}`));
});
