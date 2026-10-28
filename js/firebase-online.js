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
let isRoomHost = false;
let matchMode = "solo";
let localTeam = 0;
let playerRef = null;
let unsubscribe = null;
let lastState = { x: 0, z: 0, yaw: 0, hp: 100, alive: false, kills: 0 };
let lastWrite = 0;

const style = document.createElement("style");
style.textContent = `
#onlinePanel{position:absolute;z-index:20;left:50%;bottom:16px;transform:translateX(-50%);width:min(420px,calc(100% - 28px));padding:10px 12px;background:rgba(4,12,22,.92);border:1px solid #54e7ff70;border-radius:12px;color:#fff;font:12px system-ui;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#onlinePanel input{min-width:0;flex:1;width:100px;background:#0d1b29;border:1px solid #557080;color:white;border-radius:7px;padding:9px;text-transform:uppercase}#onlinePanel select{background:#0d1b29;color:#fff;border:1px solid #557080;border-radius:7px;padding:9px;max-width:100%}
#onlinePanel button{background:#126273;border:1px solid #54e7ff;color:white;border-radius:7px;padding:9px 10px;font-weight:800}
#onlineStatus{width:100%;color:#b9d5df;font-size:11px}#onlinePanel .onlineTitle{font-weight:900;color:#54e7ff;letter-spacing:.1em}
@media(max-width:600px){#onlinePanel{bottom:8px;gap:6px}#onlinePanel button{padding:8px}}
`;
document.head.append(style);

const panel = document.createElement("div");
panel.id = "onlinePanel";
panel.innerHTML = `<span class="onlineTitle">ONLINE</span><select id="matchModeSelect" aria-label="試合モード"><option value="solo">1v1v1v1v1v1v1v1</option><option value="squads">2v2v2v2</option></select><input id="roomCodeInput" maxlength="6" placeholder="ROOM CODE (6)" aria-label="Room code"><button id="hostRoomBtn">部屋を作る</button><button id="joinRoomBtn">参加</button><div id="onlineStatus">モードを選んで部屋を作成。最大8人、足りない枠はAI補充予定。</div>`;
document.body.append(panel);
const statusEl = document.getElementById("onlineStatus");
const codeInput = document.getElementById("roomCodeInput");
const hostBtn = document.getElementById("hostRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const modeSelect = document.getElementById("matchModeSelect");
const setStatus = msg => { statusEl.textContent = msg; };

function makeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"X"); }

async function connect(code, asHost = false) {
  roomCode = String(code).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
  if (roomCode.length !== 6) { setStatus("6文字の部屋コードを入力してね。"); return; }
  hostBtn.disabled = joinBtn.disabled = true;
  setStatus("Firebaseに接続中…");
  try {
    const credential = await signInAnonymously(auth);
    const uid = credential.user.uid;
    isRoomHost = asHost;
    if (asHost) matchMode = modeSelect.value || "solo";
    playerRef = ref(db, `rooms/${roomCode}/players/${uid}`);
    const playersRef = ref(db, `rooms/${roomCode}/players`);
    const existingSnap = await new Promise((resolve, reject) => { let stop = () => {}; stop = onValue(playersRef, snap => { stop(); resolve(snap); }, err => { stop(); reject(err); }, { onlyOnce: true }); });
    const existing = existingSnap.val() || {};
    if (!existing[uid] && Object.keys(existing).length >= 8) { setStatus("この部屋は満員（最大8人）。別の部屋を作ってね。"); return; }
    if (unsubscribe) unsubscribe();
    await set(playerRef, { uid, x:lastState.x, z:lastState.z, yaw:lastState.yaw, hp:lastState.hp, alive:lastState.alive, kills:lastState.kills, host:isRoomHost, mode:matchMode, team:teamFor(uid, matchMode), updatedAt:serverTimestamp() });
    await onDisconnect(playerRef).remove();
    window.dispatchEvent(new CustomEvent("strikezone:connected", { detail: { roomCode, mode: matchMode, host: isRoomHost } }));
    unsubscribe = onValue(ref(db, `rooms/${roomCode}/players`), snap => {
      const players = snap.val() || {};
      const list = Object.values(players).filter(p => p && typeof p.x === "number" && typeof p.z === "number");
      const host = list.find(p => p.host);
      if (!isRoomHost && host && host.mode) { matchMode = host.mode; modeSelect.value = matchMode; }
      localTeam = teamFor(uid, matchMode, list);
      const others = list.filter(p => p.uid !== uid).map(p => ({ ...p, team: teamFor(p.uid, matchMode, list) }));
      window.STRIKEZONE_REMOTE_PLAYERS = others;
      window.dispatchEvent(new CustomEvent("strikezone:players", { detail: { players: others, count: Object.keys(players).length, roomCode } }));
      const count = Object.keys(players).length;
      const bots = Math.max(0, 8 - count);
      const modeLabel = matchMode === "squads" ? "2v2v2v2" : "1v1×8";
      setStatus(`部屋 ${roomCode} · ${modeLabel} · ${count}/8人 · AI枠 ${bots} · あなたのチーム ${localTeam + 1}`);
    }, err => setStatus("DBエラー: " + err.message + " — Auth/Databaseルールを確認してね"));
    codeInput.value = roomCode;
    codeInput.readOnly = true;
  } catch (err) {
    setStatus("接続失敗: " + (err?.code || err?.message || "unknown") + "。匿名認証とDatabaseルールを確認してね。");
  } finally {
    hostBtn.disabled = joinBtn.disabled = false;
  }
}
hostBtn.addEventListener("click", () => { const code = makeCode(); codeInput.value = code; connect(code, true); });
joinBtn.addEventListener("click", () => connect(codeInput.value, false));

function teamFor(uid, mode, players = []) {
  const hashUid = value => [...String(value)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const ids = [...new Set([...players.map(p => p.uid).filter(Boolean), uid])].sort((a, b) => hashUid(a) - hashUid(b));
  const slot = Math.max(0, ids.indexOf(uid));
  return mode === "squads" ? Math.floor(slot / 2) % 4 : slot % 8;
}

window.addEventListener("strikezone:state", event => {
  lastState = { ...lastState, ...(event.detail || {}) };
  if (!playerRef || !auth.currentUser) return;
  const now = performance.now();
  if (now - lastWrite < 100) return;
  lastWrite = now;
  set(playerRef, { uid: auth.currentUser.uid, ...lastState, host:isRoomHost, mode:matchMode, team:teamFor(auth.currentUser.uid, matchMode), updatedAt: serverTimestamp() }).catch(err => setStatus("同期エラー: " + (err?.code || err?.message || "unknown")));
});

window.addEventListener("beforeunload", () => { if (unsubscribe) unsubscribe(); if (playerRef) remove(playerRef).catch(() => {}); });
