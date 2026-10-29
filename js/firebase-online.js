import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, onDisconnect, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
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
let matchStarted = false;
let localTeam = 0;
let playerRef = null;
let lobbyRef = null;
let unsubscribe = null;
let lastState = { x: 0, z: 0, yaw: 0, hp: 100, alive: false, kills: 0 };
let lastWrite = 0;

const style = document.createElement("style");
style.textContent = `
#onlinePanel{position:fixed;z-index:30;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100% - 28px));max-height:84vh;overflow:auto;padding:clamp(18px,4vw,30px);background:rgba(4,10,18,.97);border:1px solid #54e7ff70;color:#fff;font:12px system-ui;display:none;gap:10px;align-items:center;flex-wrap:wrap;box-shadow:0 20px 80px #000b}#onlinePanel.open{display:flex}#roomList{width:100%;display:flex;flex-direction:column;gap:7px;margin-top:4px}#roomList button{width:100%;text-align:left;display:flex;justify-content:space-between;gap:10px;background:#101f30;border:1px solid #2e5266;padding:12px}#roomList .empty{color:#9fb6c5;padding:12px;border:1px dashed #365264;border-radius:7px}
#onlinePanel input{min-width:0;flex:1;width:100px;background:#0d1b29;border:1px solid #557080;color:white;border-radius:7px;padding:9px;text-transform:uppercase}#onlinePanel select{background:#0d1b29;color:#fff;border:1px solid #557080;border-radius:7px;padding:9px;max-width:100%}
#onlinePanel button{background:#126273;border:1px solid #54e7ff;color:white;border-radius:7px;padding:9px 10px;font-weight:800}
#onlineStatus{width:100%;color:#b9d5df;font-size:11px}#onlinePanel .onlineTitle{font-weight:900;color:#54e7ff;letter-spacing:.1em}
@media(max-width:600px){#onlinePanel{gap:8px}#onlinePanel button{padding:9px}}
`;
document.head.append(style);

const panel = document.createElement("div");
panel.id = "onlinePanel";
panel.innerHTML = `<span class="onlineTitle" style="font-size:22px;width:100%">ONLINE / ロビー</span><button id="backMenuBtn" style="margin-left:auto;background:#263443;border-color:#607586">← メニュー</button><button id="hostRoomBtn">＋ 部屋を作る</button><input id="roomCodeInput" maxlength="6" placeholder="ROOM CODE (6)" aria-label="部屋コード"><button id="joinRoomBtn">コードで参加</button><div id="onlineStatus">部屋を作るか、下の一覧から参加してね。</div><div style="width:100%;font-weight:900;color:#54e7ff;margin-top:8px">公開中の部屋</div><div id="roomList"><div class="empty">部屋一覧を読み込み中…</div></div><select id="matchModeSelect" aria-label="試合モード" hidden><option value="solo">1v1v1v1v1v1v1v1</option><option value="squads">2v2v2v2</option></select><button id="startMatchBtn" hidden>試合開始</button>`;
document.body.append(panel);
const statusEl = document.getElementById("onlineStatus");
const roomListEl = document.getElementById("roomList");
document.getElementById("backMenuBtn").addEventListener("click", () => { panel.classList.remove("open"); window.dispatchEvent(new CustomEvent("strikezone:hide-online")); });
window.addEventListener("strikezone:show-online", () => { panel.classList.add("open"); });
const codeInput = document.getElementById("roomCodeInput");
const hostBtn = document.getElementById("hostRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const startMatchBtn = document.getElementById("startMatchBtn");
const modeSelect = document.getElementById("matchModeSelect");
const setStatus = msg => { statusEl.textContent = msg; };

function makeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"X"); }

const lobbyDirectoryRef = ref(db, "lobbies");
onValue(lobbyDirectoryRef, snap => {
  const lobbies = snap.val() || {};
  const entries = Object.entries(lobbies).filter(([code, room]) => room && room.open && typeof room.count === "number" && room.count < 8);
  roomListEl.replaceChildren();
  if (!entries.length) { const empty=document.createElement("div"); empty.className="empty"; empty.textContent="公開中の部屋はまだないよ。最初の部屋を作ってみよう！"; roomListEl.append(empty); return; }
  entries.sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
  for (const [code, room] of entries) {
    const button=document.createElement("button"), left=document.createElement("span"), right=document.createElement("span");
    left.textContent="部屋 "+code+" · "+(room.mode==="squads"?"2v2v2v2":"1v1×8");
    right.textContent=room.count+"/8人  ›"; button.append(left,right);
    button.addEventListener("click",()=>{codeInput.value=code; connect(code,false);}); roomListEl.append(button);
  }
}, err => { roomListEl.textContent="部屋一覧を読み込めないよ。FirebaseのDatabaseルールで lobbies の読み取りを許可してね。"; });

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
    lobbyRef = ref(db, `lobbies/${roomCode}`);
    const playersRef = ref(db, `rooms/${roomCode}/players`);
    const existingSnap = await new Promise((resolve, reject) => { let stop = () => {}; stop = onValue(playersRef, snap => { stop(); resolve(snap); }, err => { stop(); reject(err); }, { onlyOnce: true }); });
    const existing = existingSnap.val() || {};
    if (!existing[uid] && Object.keys(existing).length >= 8) { setStatus("この部屋は満員（最大8人）。別の部屋を作ってね。"); return; }
    if (unsubscribe) unsubscribe();
    matchStarted = false;
    await set(playerRef, { uid, x:lastState.x, z:lastState.z, yaw:lastState.yaw, hp:lastState.hp, alive:lastState.alive, kills:lastState.kills, host:isRoomHost, mode:matchMode, started:false, team:teamFor(uid, matchMode), updatedAt:serverTimestamp() });
    if (isRoomHost) { await set(lobbyRef, { open:true, mode:matchMode, count:Object.keys(existing).length+1, updatedAt:Date.now() }); await onDisconnect(lobbyRef).remove(); }
    await onDisconnect(playerRef).remove();
    unsubscribe = onValue(ref(db, `rooms/${roomCode}/players`), snap => {
      const players = snap.val() || {};
      const list = Object.values(players).filter(p => p && typeof p.x === "number" && typeof p.z === "number");
      const host = list.find(p => p.host);
      if (!isRoomHost && host && host.mode) { matchMode = host.mode; modeSelect.value = matchMode; }
      if (!isRoomHost && host && host.started && !matchStarted) { matchStarted = true; window.dispatchEvent(new CustomEvent("strikezone:connected", { detail: { roomCode, mode: matchMode, host:false } })); }
      localTeam = teamFor(uid, matchMode, list);
      const others = list.filter(p => p.uid !== uid).map(p => ({ ...p, team: teamFor(p.uid, matchMode, list) }));
      window.STRIKEZONE_REMOTE_PLAYERS = others;
      window.dispatchEvent(new CustomEvent("strikezone:players", { detail: { players: others, count: Object.keys(players).length, roomCode } }));
      const count = Object.keys(players).length;
      if (isRoomHost && lobbyRef && !matchStarted) update(lobbyRef, { open:true, mode:matchMode, count, updatedAt:Date.now() }).catch(()=>{});
      const bots = Math.max(0, 8 - count);
      const modeLabel = matchMode === "squads" ? "2v2v2v2" : "1v1×8";
      modeSelect.hidden = !isRoomHost;
      startMatchBtn.hidden = !isRoomHost;
      setStatus(isRoomHost && !matchStarted ? `部屋 ${roomCode} · ${count}/8人 · モードを選んで試合開始！` : `部屋 ${roomCode} · ${modeLabel} · ${count}/8人 · AI枠 ${bots} · あなたのチーム ${localTeam + 1}`);
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
modeSelect.addEventListener("change", async () => {
  matchMode = modeSelect.value || "solo";
  if (playerRef && isRoomHost && !matchStarted) {
    try { await update(playerRef, { mode: matchMode, team: teamFor(auth.currentUser.uid, matchMode) }); if(lobbyRef) await update(lobbyRef,{mode:matchMode,updatedAt:Date.now()}); }
    catch (err) { setStatus("モード保存失敗: " + (err?.code || err?.message || "unknown")); }
  }
});
startMatchBtn.addEventListener("click", async () => {
  if (!playerRef || !isRoomHost || matchStarted) return;
  matchMode = modeSelect.value || "solo";
  try {
    await update(playerRef, { mode: matchMode, started: true, team: teamFor(auth.currentUser.uid, matchMode) });
    if(lobbyRef) await update(lobbyRef,{open:false,mode:matchMode,updatedAt:Date.now()});
    matchStarted = true;
    window.dispatchEvent(new CustomEvent("strikezone:connected", { detail: { roomCode, mode: matchMode, host:true } }));
    setStatus("試合開始！");
  } catch (err) { setStatus("試合開始失敗: " + (err?.code || err?.message || "unknown")); }
});

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
  update(playerRef, { ...lastState, host:isRoomHost, mode:matchMode, started:matchStarted, team:teamFor(auth.currentUser.uid, matchMode), updatedAt: serverTimestamp() }).catch(err => setStatus("同期エラー: " + (err?.code || err?.message || "unknown")));
});

window.addEventListener("beforeunload", () => { if (unsubscribe) unsubscribe(); if (playerRef) remove(playerRef).catch(() => {}); });
