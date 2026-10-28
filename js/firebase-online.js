import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD98oIO_5hSuk4tu4brPaMJUkp2llpHLqE",
  authDomain: "strikezone-48cf0.firebaseapp.com",
  databaseURL: "https://strikezone-48cf0-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "strikezone-48cf0",
  storageBucket: "strikezone-48cf0.firebasestorage.app",
  messagingSenderId: "409820450716",
  appId: "1:409820450716:web:194f3501f9416f51990259",
  measurementId: "G-FS5NLVEYVC"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
let roomCode = null;
let playerRef = null;
let unsubscribe = null;
let lastState = { x: 0, z: 0, yaw: 0, hp: 100, alive: false, kills: 0 };
let lastWrite = 0;

const style = document.createElement("style");
style.textContent = `
#onlinePanel{position:absolute;z-index:20;left:50%;bottom:16px;transform:translateX(-50%);width:min(420px,calc(100% - 28px));padding:10px 12px;background:rgba(4,12,22,.92);border:1px solid #54e7ff70;border-radius:12px;color:#fff;font:12px system-ui;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#onlinePanel input{min-width:0;flex:1;width:100px;background:#0d1b29;border:1px solid #557080;color:white;border-radius:7px;padding:9px;text-transform:uppercase}
#onlinePanel button{background:#126273;border:1px solid #54e7ff;color:white;border-radius:7px;padding:9px 10px;font-weight:800}
#onlineStatus{width:100%;color:#b9d5df;font-size:11px}#onlinePanel .onlineTitle{font-weight:900;color:#54e7ff;letter-spacing:.1em}
@media(max-width:600px){#onlinePanel{bottom:8px;gap:6px}#onlinePanel button{padding:8px}}
`;
document.head.append(style);

const panel = document.createElement("div");
panel.id = "onlinePanel";
panel.innerHTML = `<span class="onlineTitle">ONLINE</span><input id="roomCodeInput" maxlength="6" placeholder="ROOM CODE (6)" aria-label="Room code"><button id="hostRoomBtn">部屋を作る</button><button id="joinRoomBtn">参加</button><div id="onlineStatus">オンライン準備中。部屋を作るかコードを入力。</div>`;
document.body.append(panel);
const statusEl = document.getElementById("onlineStatus");
const codeInput = document.getElementById("roomCodeInput");
const hostBtn = document.getElementById("hostRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const setStatus = msg => { statusEl.textContent = msg; };

function makeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"X"); }

async function connect(code) {
  roomCode = String(code).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
  if (roomCode.length !== 6) { setStatus("6文字の部屋コードを入力してね。"); return; }
  hostBtn.disabled = joinBtn.disabled = true;
  try {
    const credential = await signInAnonymously(auth);
    const uid = credential.user.uid;
    playerRef = ref(db, `rooms/${roomCode}/players/${uid}`);
    if (unsubscribe) unsubscribe();
    await set(playerRef, { uid, x:lastState.x, z:lastState.z, yaw:lastState.yaw, hp:lastState.hp, alive:lastState.alive, kills:lastState.kills, updatedAt:serverTimestamp() });
    await onDisconnect(playerRef).remove();
    unsubscribe = onValue(ref(db, `rooms/${roomCode}/players`), snap => {
      const players = snap.val() || {};
      const others = Object.values(players).filter(p => p && p.uid !== uid && typeof p.x === "number" && typeof p.z === "number");
      window.STRIKEZONE_REMOTE_PLAYERS = others;
      window.dispatchEvent(new CustomEvent("strikezone:players", { detail: { players: others, count: Object.keys(players).length, roomCode } }));
      setStatus(`部屋 ${roomCode} · ${Object.keys(players).length}人参加中（この端末含む）`);
    }, err => setStatus("DBエラー: " + err.message + " — Auth/Databaseルールを確認してね"));
    codeInput.value = roomCode;
    codeInput.readOnly = true;
    setStatus(`部屋 ${roomCode} に接続中…`);
  } catch (err) {
    setStatus("接続失敗: " + (err?.code || err?.message || "unknown") + "。匿名認証とDatabaseルールを確認してね。");
  } finally {
    hostBtn.disabled = joinBtn.disabled = false;
  }
}
hostBtn.addEventListener("click", () => { const code = makeCode(); codeInput.value = code; connect(code); });
joinBtn.addEventListener("click", () => connect(codeInput.value));

window.addEventListener("strikezone:state", event => {
  lastState = { ...lastState, ...(event.detail || {}) };
  if (!playerRef || !auth.currentUser) return;
  const now = performance.now();
  if (now - lastWrite < 100) return;
  lastWrite = now;
  set(playerRef, { uid: auth.currentUser.uid, ...lastState, updatedAt: serverTimestamp() }).catch(err => setStatus("同期エラー: " + (err?.code || err?.message || "unknown")));
});

window.addEventListener("beforeunload", () => { if (unsubscribe) unsubscribe(); if (playerRef) remove(playerRef).catch(() => {}); });
