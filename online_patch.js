// ゲーム終了判定の追加部分
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
        
        // ゲーム終了判定
        const players = data.players || {};
        for (const pid in players) {
            if (pid !== myId && (!players[pid].hand || players[pid].hand.length === 0)) {
                showResult(`相手が上がりました。あなたの敗北です。`);
                return;
            }
        }
        
        if (hand.length === 0) {
            showResult(`あなたが上がりました。勝利です！`);
            return;
        }

        if (data.status === "playing") scrollToPlay();
    });
}
