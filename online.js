/************************************************************
 * online.js  — ルーム管理・待機画面処理
 ************************************************************/

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

export let myId = "p_" + Math.floor(Math.random() * 1000000000);
export let myName = "名無し";
let roomId = null;
let isHost = false;


/************************************************************
 * DOM 要素
 ************************************************************/
const lobbySection = document.getElementById("lobbySection");
const playSection  = document.getElementById("playSection");

playSection.style.display = "none"; // 初期は非表示


/************************************************************
 * 名前設定
 ************************************************************/
document.getElementById("setNameBtn").onclick = () => {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) return alert("名前を入力してください");

    myName = name;

    if (roomId) {
        update(ref(db, `rooms/${roomId}/players/${myId}`), { name });
    }

    alert("名前を設定しました：" + myName);
};


/************************************************************
 * ランダム4桁ルームID
 ************************************************************/
function generateRoomId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}


/************************************************************
 * ルーム作成
 ************************************************************/
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

    await joinRoom(roomId);
};


/************************************************************
 * ルーム参加
 ************************************************************/
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

    alert("ルームに参加しました");

    watchPlayers();
    watchStatus();

    // ルームID表示
    document.getElementById("roomIdText").textContent = "ルームID：" + roomId;
    document.getElementById("copyRoomIdBtn").style.display = "inline-block";
}


/************************************************************
 * プレイヤー一覧監視
 ************************************************************/
function watchPlayers() {
    onValue(ref(db, `rooms/${roomId}/players`), snap => {
        const list = snap.val() || {};
        const box = document.getElementById("playerList");

        box.innerHTML = "<h3>参加プレイヤー</h3>";

        for (const pid in list) {
            const div = document.createElement("div");
            div.textContent = list[pid].name + (pid === myId ? "（あなた）" : "");
            box.appendChild(div);
        }
    });
}


/************************************************************
 * ゲーム開始（ホスト）
 ************************************************************/
document.getElementById("startGameBtn").onclick = async () => {
    if (!isHost) return alert("ホストのみ開始できます");

    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const players = snap.val() || {};
    const ids = Object.keys(players);

    if (ids.length !== 2) return alert("今は2人対戦のみです");

    const shuffled = [...ids].sort(() => Math.random() - 0.5);

    await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        turnOrder: { 0: shuffled[0], 1: shuffled[1] },
        turn: shuffled[0]
    });
};


/************************************************************
 * ★ 状態変化監視（playing → 対戦画面へ、自動スクロール）
 ************************************************************/
function watchStatus() {
    onValue(ref(db, `rooms/${roomId}/status`), snap => {
        const status = snap.val();

        if (status === "playing") {
            lobbySection.style.display = "none";
            playSection.style.display = "block";

            // スクロール
            playSection.scrollIntoView({ behavior: "smooth" });

            // 対戦ロジック側を起動
            if (window.onlineGameInit) {
                window.onlineGameInit(myId, roomId, myName);
            }
        }

        if (status === "finished") {
            showResultPopup();
        }
    });
}


/************************************************************
 * ★ 結果ポップアップ表示
 ************************************************************/
function showResultPopup() {
    const popup = document.getElementById("resultPopup");
    const text  = document.getElementById("resultText");

    get(ref(db, `rooms/${roomId}/winner`)).then(snap => {
        text.textContent = `勝者：${snap.val()}`;
        popup.style.display = "block";
    });
}


/************************************************************
 * ルームを解散する
 ************************************************************/
document.getElementById("closeRoomBtn").onclick = async () => {
    if (!roomId) return;

    await remove(ref(db, `rooms/${roomId}`));
    alert("ルームを解散しました");
    location.href = "index.html";
};


/************************************************************
 * もう一度遊ぶ
 ************************************************************/
document.getElementById("restartBtn").onclick = async () => {
    if (!isHost) return alert("ホストのみ操作できます");

    await update(ref(db, `rooms/${roomId}`), {
        status: "waiting",
        field: [],
        fieldStack: [],
        turn: null
    });

    location.reload();
};


/************************************************************
 * タブを閉じたときにルームから消える
 ************************************************************/
window.addEventListener("beforeunload", () => {
    if (roomId && myId) {
        remove(ref(db, `rooms/${roomId}/players/${myId}`));
    }
});
