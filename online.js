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

/****************************************************
 * Firebase 初期設定
 ****************************************************/
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

/****************************************************
 * プレイヤー情報
 ****************************************************/
export let myId = "p_" + Math.floor(Math.random() * 10000000);
export let myName = "名無し";
let roomId = null;
let isHost = false;

/****************************************************
 * 名前設定
 ****************************************************/
document.getElementById("setNameBtn").onclick = () => {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) return alert("名前を入力してください");

    myName = name;

    if (roomId)
        update(ref(db, `rooms/${roomId}/players/${myId}`), { name: myName });

    alert(`名前を「${myName}」に設定しました`);
};

/****************************************************
 * 4桁ルームID生成
 ****************************************************/
function generateRoomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

/****************************************************
 * ホスト：ルーム作成
 ****************************************************/
document.getElementById("createRoomBtn").onclick = async () => {
    roomId = generateRoomId();
    isHost = true;

    await set(ref(db, `rooms/${roomId}`), {
        status: "waiting",
        players: {},
        field: [],
        fieldStack: [],
        turnOrder: {},
        turn: null
    });

    // 🔥 先に通知（joinRoom の alert と順番を逆転しないため）
    alert("ルームを作成しました！ ID：" + roomId);

    await joinRoom(roomId);
};

/****************************************************
 * ルーム参加
 ****************************************************/
async function joinRoom(id) {
    roomId = id.trim();
    if (!roomId) return alert("ルームIDを入力してください");

    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
        name: myName,
        hand: []
    });

    document.getElementById("roomIdText").textContent = "ルームID: " + roomId;
    document.getElementById("copyRoomIdBtn").style.display = "inline-block";

    watchPlayers();
    watchStatus();
    watchDisconnect();

    // ★ joinRoom 内では alert を出さない！
}

document.getElementById("joinRoomBtn").onclick = () => {
    const id = document.getElementById("joinRoomId").value.trim();
    if (!id) return alert("ルームIDを入力してください");

    joinRoom(id).then(() => {
        alert("ルームに参加しました！");
    });
};

/****************************************************
 * プレイヤー一覧表示
 ****************************************************/
function watchPlayers() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const players = snap.val() || {};
        const area = document.getElementById("playerList");
        area.innerHTML = "<h3>参加プレイヤー：</h3>";

        for (const pid in players) {
            const name = players[pid].name ?? "名無し";
            const div = document.createElement("div");
            div.textContent = `${name} ${pid === myId ? "(あなた)" : ""}`;
            area.appendChild(div);
        }

        // ★ 対戦中の途中退出 → 残った方が勝ち
        handleUnexpectedLeave(players);
    });
}

/****************************************************
 * 途中退出検知（対戦中のみ発動）
 ****************************************************/
function handleUnexpectedLeave(players) {
    if (!players[myId]) {
        alert("ルームから追放されました");
        location.reload();
        return;
    }

    if (!isHost) return; // 判定はホストだけが行う

    // 対戦中でプレイヤーが1人になった
    get(ref(db, `rooms/${roomId}/status`)).then(s => {
        if (s.val() !== "playing") return;

        if (Object.keys(players).length === 1) {
            update(ref(db, `rooms/${roomId}`), { status: "finished" });
            alert("相手が離脱しました。あなたの勝ちです！");
        }
    });
}

/****************************************************
 * Firebase onDisconnect（抜けたら自動削除）
 ****************************************************/
function watchDisconnect() {
    const playerRef = ref(db, `rooms/${roomId}/players/${myId}`);
    import("https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js")
        .then(({ onDisconnect }) => {
            onDisconnect(playerRef).remove();
        });
}

/****************************************************
 * ゲーム開始（ホストのみ）
 ****************************************************/
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

/****************************************************
 * ゲーム開始したらプレイ画面へスクロール
 ****************************************************/
function watchStatus() {
    onValue(ref(db, `rooms/${roomId}/status`), snap => {
        const st = snap.val();

        if (st === "playing") {
            document.getElementById("playSection").scrollIntoView({ behavior: "smooth" });
        }

        if (st === "waiting") {
            document.getElementById("waitSection").scrollIntoView({ behavior: "smooth" });
        }
    });
}

/****************************************************
 * ルームIDコピー
 ****************************************************/
document.getElementById("copyRoomIdBtn").onclick = () => {
    if (!roomId) return;

    navigator.clipboard.writeText(roomId)
        .then(() => alert("コピーしました: " + roomId))
        .catch(() => alert("コピーできませんでした"));
};
