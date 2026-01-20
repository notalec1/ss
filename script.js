/* --- REPLACE THE ENTIRE CONTENTS OF lineup-main/script.js WITH THIS --- */

// --- CONFIG & STATE ---
const GOD_PASSWORD = "line1up";
const AUTO_NAMES = ["Alec", "Alain", "Nada", "Hoda", "Fadi", "Noa", "Gio", "Neo", "Nounou", "Assaad", "Chris", "Eliott"];

const firebaseConfig = {
  apiKey: "AIzaSyBLXXrwC2WF8ENCdpMEe9e4ClCyBZcF4Pc",
  authDomain: "lineup-12345.firebaseapp.com",
  databaseURL: "https://lineup-12345-default-rtdb.firebaseio.com",
  projectId: "lineup-12345",
  storageBucket: "lineup-12345.firebasestorage.app",
  messagingSenderId: "785796686648",
  appId: "1:785796686648:web:d31f6a30767a4c1a8fd7cd",
  measurementId: "G-ZD6G5FLXQ6"
};

// Initialize Firebase if keys are present
let db, auth;
try {
    if (FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY_HERE") {
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        auth = firebase.auth();
        console.log("🔥 Firebase Initialized");
    } else {
        console.warn("⚠️ Firebase keys missing. Online features disabled.");
    }
} catch (e) { console.error("Firebase Error:", e); }

// --- I18N DICTIONARY ---
const TRANSLATIONS = {
    en: {
        title: "Line Up!",
        subtitle: "The Ultimate Chaos Number Game",
        loading: "Loading...",
        players: "Players",
        add: "Add",
        configure: "Configure Game",
        start: "Launch Game",
        roomMode: "Room Mode",
        waiting: "Waiting for host...",
        passPlay: "Pass & Play",
        settings: "Settings",
        distribute: "Distribute",
        verify: "Verify",
        results: "Results",
        hideSuggestions: "🔼 Collapse Suggestions",
        showSuggestions: "🔽 Expand Suggestions"
    },
    es: {
        title: "¡Alinearse!",
        subtitle: "El juego de números del caos",
        loading: "Cargando...",
        players: "Jugadores",
        add: "Añadir",
        configure: "Configurar Juego",
        start: "Lanzar Juego",
        roomMode: "Modo Sala",
        waiting: "Esperando al anfitrión...",
        passPlay: "Pasa y Juega",
        settings: "Ajustes",
        distribute: "Distribuir",
        verify: "Verificar",
        results: "Resultados",
        hideSuggestions: "🔼 Ocultar Sugerencias",
        showSuggestions: "🔽 Mostrar Sugerencias"
    },
    fr: {
        title: "Alignez-vous!",
        subtitle: "Le jeu de nombres chaotique",
        loading: "Chargement...",
        players: "Joueurs",
        add: "Ajouter",
        configure: "Configurer",
        start: "Lancer",
        roomMode: "Mode Salle",
        waiting: "En attente de l'hôte...",
        passPlay: "Passe & Joue",
        settings: "Paramètres",
        distribute: "Distribuer",
        verify: "Vérifier",
        results: "Résultats",
        hideSuggestions: "🔼 Masquer Suggestions",
        showSuggestions: "🔽 Afficher Suggestions"
    }
};
let currentLang = localStorage.getItem('lineUpLang') || 'en';

// --- STATE ---
const SFX_FILES = {
    add: "sfx/getgems.wav",
    popup: "sfx/popup.wav",
    win: "sfx/unlimitedplay_spark.wav",
    lose: "sfx/streaklost.wav",
    start: "sfx/startupshine.wav",
    tick: "sfx/tick.wav"
};

const DEFAULT_STATE = { 
    step: 'SETUP', 
    players: [], 
    settings: { min: 1, max: 100, order: 'asc', timerMode: 'up', duration: 120 }, 
    startTime: null, 
    finalTime: null, 
    passIndex: 0, 
    viewingNumber: false,
    revealedCount: 0 
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let timerInterval = null;
let revealInterval = null; 
let godMode = false;
let movingPlayerIndex = null; 
let viewMode = sessionStorage.getItem('lineUpViewMode') || null; 
let isAutoNamesExpanded = false;

// Screensaver State
let screensaverTimeout = null;
const SCREENSAVER_DELAY = 300000; // 5 Minutes

const app = document.getElementById('app');

// --- UTILS ---
function t(key) {
    return TRANSLATIONS[currentLang][key] || key;
}

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lineUpLang', lang);
    render();
}

function pulse(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }
async function requestWakeLock() { if ('wakeLock' in navigator) { try { await navigator.wakeLock.request('screen'); } catch (err) {} } }
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}
function formatTime(s) { 
    if(s === null) return "0:00";
    if(s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`; 
}
function setViewMode(mode) {
    viewMode = mode;
    sessionStorage.setItem('lineUpViewMode', mode);
    if(mode === 'tv') document.body.classList.add('is-tv-mode');
    else document.body.classList.remove('is-tv-mode');
    render();
}
function resetViewMode() {
    viewMode = null;
    sessionStorage.removeItem('lineUpViewMode');
    document.body.classList.remove('is-tv-mode');
    render();
}

// --- SCREENSAVER LOGIC ---
function initScreensaver() {
    const el = document.getElementById('screensaver');
    
    function resetTimer() {
        if(el.classList.contains('active')) {
            el.classList.remove('active');
        }
        clearTimeout(screensaverTimeout);
        screensaverTimeout = setTimeout(() => {
            // Only show if in TV mode or explicit setting
            if(viewMode === 'tv' || state.step === 'SETUP') {
                el.classList.add('active');
            }
        }, SCREENSAVER_DELAY);
    }

    // Attach to user activity
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(evt => {
        window.addEventListener(evt, resetTimer);
    });
    
    resetTimer();
}

// --- THEME MANAGER & SFX ---
const DEFAULT_THEME = { 
    blur: 15, scale: 1.0, snow: true, sfx: true,
    color: '#6366f1', font: "'Nunito', sans-serif", speed: 6,
    controls: 'jump'
};
let theme = DEFAULT_THEME;
try {
    const savedTheme = localStorage.getItem('lineUpTheme');
    if (savedTheme) theme = { ...DEFAULT_THEME, ...JSON.parse(savedTheme) }; 
} catch (e) { console.error("Theme Load Error", e); }

const audioCache = {};
Object.keys(SFX_FILES).forEach(key => {
    const a = new Audio(SFX_FILES[key]);
    a.preload = 'auto';
    audioCache[key] = a;
});

function playSfx(key) {
    if (!theme.sfx || !audioCache[key]) return;
    const sound = audioCache[key].cloneNode();
    sound.volume = 0.6;
    sound.play().catch(e => console.log("Audio autoplay prevented"));
}

function applyTheme() {
    const root = document.documentElement.style;
    root.setProperty('--glass-blur', theme.blur + 'px');
    root.setProperty('--font-scale', theme.scale);
    root.setProperty('--primary', theme.color);
    root.setProperty('--bg-speed', theme.speed + 's');
    root.setProperty('--font-type', theme.font);

    const ids = ['blurInput','scaleInput','snowInput','sfxInput','colorInput','fontInput','speedInput','controlInput'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        if(el.type === 'checkbox') el.checked = theme[id.replace('Input','')];
        else el.value = theme[id.replace('Input','')];
    });
    
    const canvas = document.getElementById('snowCanvas');
    if(canvas) canvas.style.display = theme.snow ? 'block' : 'none';
}

function updateTheme(key, val) {
    if(key === 'blur' || key === 'speed') val = parseInt(val);
    if(key === 'scale') val = parseFloat(val);
    theme[key] = val;
    localStorage.setItem('lineUpTheme', JSON.stringify(theme));
    applyTheme();
    render();
}

// --- SNOW FX ---
function initSnow() {
    const canvas = document.getElementById('snowCanvas');
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    const snowflakes = [];
    window.addEventListener('resize', () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; });
    for (let i = 0; i < 50; i++) snowflakes.push({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 3 + 1, d: Math.random() * 50 });
    function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        for (let i = 0; i < 50; i++) {
            const f = snowflakes[i];
            ctx.moveTo(f.x, f.y);
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true);
        }
        ctx.fill();
        update();
        requestAnimationFrame(draw);
    }
    function update() {
        for (let i = 0; i < 50; i++) {
            const f = snowflakes[i];
            f.y += Math.pow(f.d, 2) + 1;
            f.y = f.y > height ? 0 : f.y;
            f.x += Math.sin(f.y / 50);
        }
    }
    draw();
}

// --- DATA MANAGEMENT ---
function loadState() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('p') || params.has('room') || params.has('roomId')) return;
    try {
        const saved = localStorage.getItem('lineUpState');
        if (saved) {
            state = JSON.parse(saved);
            if (!state.settings.timerMode) { state.settings.timerMode = 'up'; state.settings.duration = 120; }
            if (state.step === 'DISTRIBUTE') { state.startTime = null; state.finalTime = null; }
            if (state.revealedCount === undefined) state.revealedCount = 0; 
            if ((state.step === 'VERIFY') && state.startTime) startTimerTicker();
        }
    } catch (e) { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); }
}

function saveState() {
    // Only save to local storage if we are not in a live firebase room
    if (!new URLSearchParams(window.location.search).has('roomId')) {
        localStorage.setItem('lineUpState', JSON.stringify(state));
    } else if (db && window.currentRoomId && viewMode === 'tv') {
        // If Host in Firebase mode, sync state to cloud
        db.collection('rooms').doc(window.currentRoomId).update({
            state: JSON.stringify(state),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

// --- FIREBASE LOGIC ---

async function createFirebaseRoom() {
    if (!db) return showToast("Firebase not configured!");
    
    // 1. Host Login (Anonymous)
    await auth.signInAnonymously();
    
    // 2. Create Room
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.currentRoomId = roomId;
    
    await db.collection('rooms').doc(roomId).set({
        host: auth.currentUser.uid,
        created: firebase.firestore.FieldValue.serverTimestamp(),
        state: JSON.stringify(state)
    });

    showToast(`Room Created: ${roomId}`);
    return roomId;
}

async function joinFirebaseRoom(roomId) {
    if (!db) return showToast("Firebase not configured!");
    
    // 1. Player Login
    await auth.signInAnonymously();
    
    // 2. Listen to Room
    db.collection('rooms').doc(roomId).onSnapshot((doc) => {
        if (doc.exists) {
            const remoteState = JSON.parse(doc.data().state);
            // Detect new round/changes
            handleRemoteUpdate(remoteState);
        } else {
            showToast("Room ended by host.");
        }
    });
}

function handleRemoteUpdate(remoteState) {
    // Player logic to update UI based on what the host did
    const myName = sessionStorage.getItem('lineUpMyName');
    
    // If I haven't claimed a name yet, render the pick list
    if (!myName) {
        renderRoomPickList(remoteState);
        return;
    }

    // If I have a name, find my data
    const myData = remoteState.players.find(p => p.name === myName);
    if (!myData) {
        // Maybe kicked?
        sessionStorage.removeItem('lineUpMyName');
        renderRoomPickList(remoteState);
        return;
    }

    // Render my number view
    renderRealTimePlayerView(myData, remoteState.settings);
}

// --- STANDARD LOGIC ---

function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem('lineUpLeaderboard')) || {}; } catch(e) { return {}; }
}

function updateScores() {
    const sorted = [...state.players].sort((a, b) => state.settings.order === 'asc' ? a.number - b.number : b.number - a.number);
    const scores = getLeaderboard();
    let changed = false;
    state.players.forEach((p, i) => {
        if (p.name === sorted[i].name) {
            scores[p.name] = (scores[p.name] || 0) + 10;
            changed = true;
        } else { scores[p.name] = scores[p.name] || 0; }
    });
    if(changed) localStorage.setItem('lineUpLeaderboard', JSON.stringify(scores));
    return scores;
}

function resetScores() {
    if(confirm("Reset scores?")) {
        localStorage.removeItem('lineUpLeaderboard');
        showToast("Reset!");
        render();
    }
}

function exportData() {
    const data = {
        presets: localStorage.getItem('lineUpPresets'),
        history: localStorage.getItem('lineUpHistory'),
        state: localStorage.getItem('lineUpState'),
        leaderboard: localStorage.getItem('lineUpLeaderboard')
    };
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lineup-backup.json';
    a.click();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.presets) localStorage.setItem('lineUpPresets', data.presets);
            if (data.history) localStorage.setItem('lineUpHistory', data.history);
            if (data.state) localStorage.setItem('lineUpState', data.state);
            if (data.leaderboard) localStorage.setItem('lineUpLeaderboard', data.leaderboard);
            loadState(); render(); closeModal('dataModal');
        } catch(err) { showToast("Invalid File"); }
    };
    reader.readAsText(file);
}

function wipeData() {
    if(confirm("Factory Reset?")) {
        localStorage.clear(); 
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        render(); closeModal('dataModal');
    }
}

// --- GAME LOGIC ---
function addPlayer(optionalName) {
    const input = document.getElementById('nameInput');
    const name = optionalName || input.value.trim();
    if (!name) return;
    const exists = state.players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if(exists) return showToast("Name taken!");
    
    playSfx('add'); 
    state.players.push({ name, number: 0 });
    if(input) input.value = '';
    setState('SETUP');
    if(!optionalName) setTimeout(() => { const el = document.getElementById('nameInput'); if(el) el.focus(); }, 50);
    pulse();
}

function removePlayer(i) { state.players.splice(i, 1); setState('SETUP'); pulse(); }

function openGameSettings() {
    if(state.players.length < 2) return showToast("Need 2+ players!");
    document.getElementById('settingMin').value = state.settings.min;
    document.getElementById('settingMax').value = state.settings.max;
    document.getElementById('settingOrder').value = state.settings.order;
    document.getElementById('settingDuration').value = state.settings.duration || 120;
    toggleTimerMode(state.settings.timerMode || 'up');
    openModal('gameSettingsModal');
}

function toggleTimerMode(mode) {
    state.settings.timerMode = mode;
    const upBtn = document.getElementById('btnTimerUp');
    const downBtn = document.getElementById('btnTimerDown');
    const inputDiv = document.getElementById('timerDurationInput');

    if(mode === 'up') {
        upBtn.style.border = '2px solid var(--primary)'; upBtn.style.opacity = '1';
        downBtn.style.border = '1px solid var(--border)'; downBtn.style.opacity = '0.5';
        inputDiv.style.display = 'none';
    } else {
        downBtn.style.border = '2px solid var(--primary)'; downBtn.style.opacity = '1';
        upBtn.style.border = '1px solid var(--border)'; upBtn.style.opacity = '0.5';
        inputDiv.style.display = 'block';
    }
}

function adjustTime(amount) {
    const el = document.getElementById('settingDuration');
    let val = parseInt(el.value) + amount;
    if(val < 10) val = 10;
    el.value = val;
}
function setDuration(val) { document.getElementById('settingDuration').value = val; pulse(); }

function generateNumbers() {
    const min = parseInt(document.getElementById('settingMin').value);
    const max = parseInt(document.getElementById('settingMax').value);
    if (min >= max) { showToast("Min must be < Max!"); return false; }
    
    state.settings.min = min; 
    state.settings.max = max;
    state.settings.order = document.getElementById('settingOrder').value;
    state.settings.duration = parseInt(document.getElementById('settingDuration').value);

    const used = new Set();
    state.players.forEach(p => {
        let num;
        do { num = Math.floor(Math.random() * (max - min + 1)) + min; } while (used.has(num));
        used.add(num); p.number = num;
    });
    return true;
}

function startGame() {
    if (generateNumbers()) {
        closeModal('gameSettingsModal'); 
        state.startTime = null; 
        state.finalTime = null;
        setState('DISTRIBUTE'); pulse(); requestWakeLock();
    }
}

function startVerification() { state.startTime = Date.now(); setState('VERIFY'); }

function startPassGame() {
    if (state.players.length < 2) return showToast("Need 2+ players!");
    if (generateNumbers()) {
        state.passIndex = 0; state.viewingNumber = false; state.startTime = null;
        setState('PASS_PLAY'); pulse(); requestWakeLock();
    }
}

function nextPassPlayer() {
    if (state.passIndex < state.players.length - 1) {
        state.passIndex++; state.viewingNumber = false; saveState(); render();
    } else { startVerification(); }
    pulse();
}

function restartSamePlayers() { state.startTime = null; state.finalTime = null; startGame(); }
function resetGameData() { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); saveState(); render(); }

// --- PRESETS & HISTORY ---
function savePreset() {
    if(state.players.length === 0) return showToast("No players");
    const name = prompt("Group Name?");
    if(name) {
        const presets = JSON.parse(localStorage.getItem('lineUpPresets')) || [];
        presets.push({ name, players: state.players.map(p => ({ name: p.name, number: 0 })), min: state.settings.min, max: state.settings.max });
        localStorage.setItem('lineUpPresets', JSON.stringify(presets));
        showToast("Saved!");
    }
}

function loadPreset(index) {
    const presets = JSON.parse(localStorage.getItem('lineUpPresets')) || [];
    if(presets[index]) {
        state.players = JSON.parse(JSON.stringify(presets[index].players));
        if(presets[index].min !== undefined) state.settings.min = presets[index].min;
        if(presets[index].max !== undefined) state.settings.max = presets[index].max;
        saveState(); closeModal('presetsModal'); render(); showToast("Loaded!");
    }
}

function deletePreset(index) {
    const presets = JSON.parse(localStorage.getItem('lineUpPresets')) || [];
    presets.splice(index, 1);
    localStorage.setItem('lineUpPresets', JSON.stringify(presets));
    renderPresetsList();
}

function renderPresetsList() {
    const presets = JSON.parse(localStorage.getItem('lineUpPresets')) || [];
    const el = document.getElementById('presetsList');
    if(presets.length === 0) { el.innerHTML = "<p>No saved groups.</p>"; return; }
    el.innerHTML = presets.map((p, i) => `
        <div class="item-card" style="margin-bottom:8px;">
            <div><strong>${p.name}</strong> (${p.players.length})</div>
            <div style="display:flex; gap:5px;">
                <button class="btn-primary btn-sm" onclick="loadPreset(${i})">Load</button>
                <button class="btn-danger btn-sm" onclick="deletePreset(${i})">X</button>
            </div>
        </div>`).join('');
}

function saveHistory(win) {
    const log = JSON.parse(localStorage.getItem('lineUpHistory')) || [];
    log.unshift({
        date: new Date().toLocaleDateString(),
        players: state.players.length,
        roster: state.players.map(p => p.name), 
        time: formatTime(state.finalTime),
        win: win
    });
    if(log.length > 20) log.pop();
    localStorage.setItem('lineUpHistory', JSON.stringify(log));
}

function renderHistoryList() {
    const log = JSON.parse(localStorage.getItem('lineUpHistory')) || [];
    const el = document.getElementById('historyList');
    if(log.length === 0) { el.innerHTML = "<p>Empty.</p>"; return; }
    el.innerHTML = log.map((g, index) => `
        <div class="item-card" style="margin-bottom:8px; display:block;">
            <div style="display:flex; justify-content:space-between;">
                <div><strong>${g.players} Players</strong></div>
                <div>${g.time} ${g.win ? '✅' : '❌'}</div>
            </div>
        </div>`).join('');
}

function toggleAutoNames() { isAutoNamesExpanded = !isAutoNamesExpanded; render(); }
function toggleGodMode() {
    if(godMode) { godMode = false; render(); } else { 
        if(prompt("Admin Password:") === GOD_PASSWORD) { godMode = true; render(); } 
    }
}

function startTimerTicker() {
    if(timerInterval) clearInterval(timerInterval);
    const overlay = document.getElementById('tensionOverlay');
    timerInterval = setInterval(() => {
        const el = document.getElementById('timerDisplay');
        if(el && state.startTime) {
            let diff = Math.floor((Date.now() - state.startTime) / 1000);
            if(state.settings.timerMode === 'down') {
                const remaining = state.settings.duration - diff;
                if (remaining <= state.settings.duration && overlay) {
                   const intensity = 1 - (remaining / state.settings.duration);
                   overlay.style.opacity = Math.max(0, Math.min(0.8, intensity));
                }
                if(remaining <= 0) { clearInterval(timerInterval); el.innerText = `⏱️ 0:00`; if(overlay) overlay.style.opacity = 0; if(state.step !== 'RESULTS') checkOrder(); return; }
                el.innerText = `⏱️ ${formatTime(remaining)}`;
            } else {
                if(overlay) overlay.style.opacity = 0;
                el.innerText = `⏱️ ${formatTime(diff)}`;
            }
        }
    }, 1000);
}

function openModal(id) { 
    playSfx('popup'); 
    const m = document.getElementById(id); m.classList.add('active'); 
    if(id==='presetsModal') renderPresetsList(); 
    if(id==='historyModal') renderHistoryList(); 
    if(id==='leaderboardModal') document.getElementById('mobileLeaderboardList').innerHTML = getLeaderboardHtml();
    if(id==='themeModal') applyTheme();
    pulse(); 
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); pulse(); }

function setState(s) { 
    state.step = s; saveState(); 
    const overlay = document.getElementById('tensionOverlay');
    if ((s === 'SETUP' || s === 'RESULTS') && overlay) overlay.style.opacity = 0;
    render(); 
}

function render() {
    document.getElementById('langSelect').value = currentLang;
    const params = new URLSearchParams(window.location.search);
    
    // FIREBASE MODE: Player Listening
    if (params.get('roomId')) {
        const rId = params.get('roomId');
        if (!window.isListening) {
            window.isListening = true;
            joinFirebaseRoom(rId);
        }
        // render handled by handleRemoteUpdate
        return;
    }

    if (params.get('p')) { renderPlayerView(params.get('p')); return; }
    if (params.get('room')) { renderRoomView(params.get('room')); return; }
    if (!viewMode) { renderModeSelection(); return; }

    if(state.step === 'SETUP') renderSetup();
    else if(state.step === 'DISTRIBUTE') renderDistribute();
    else if(state.step === 'PASS_PLAY') renderPassPlay();
    else if(state.step === 'VERIFY') renderVerify();
    else if(state.step === 'RESULTS') renderResults();
    
    applyTheme();
}

// --- COMPONENTS ---
function getLeaderboardHtml() {
    const scores = getLeaderboard();
    const entries = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    if (entries.length === 0) return `<div style="text-align:center; opacity:0.6">No scores.</div>`;
    return entries.map((e, i) => `
        <div class="item-card" style="padding:10px;">
            <span>${i+1}. ${e[0]}</span> <strong>${e[1]} pts</strong>
        </div>`).join('');
}

function renderModeSelection() {
    app.innerHTML = `
        <h1>${t('title')}</h1>
        <div class="row" style="margin-top:20px;">
            <button class="mode-btn col" onclick="setViewMode('mobile')">📱 Mobile</button>
            <button class="mode-btn col" onclick="setViewMode('tv')">📺 TV</button>
        </div>`;
}

function renderSetup() {
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()">👁️</button>`;
    const leftContent = `
        <h1>${t('title')}</h1>
        <p>${t('subtitle')}</p>
        <div class="divider"></div>
        <div style="display:flex; justify-content:space-between;">
            <label class="label">${t('players')} (${state.players.length})</label>
            <div style="display:flex; gap:5px;">
                <button class="btn-secondary btn-sm" onclick="openModal('presetsModal')">💾</button>
                <button class="btn-secondary btn-sm" onclick="openModal('leaderboardModal')">🏆</button>
                <button class="btn-secondary btn-sm" onclick="openModal('historyModal')">📜</button>
                <button class="btn-secondary btn-sm" onclick="openModal('themeModal'); applyTheme();">🎨</button>
                <button class="btn-secondary btn-sm" onclick="openModal('dataModal')">⚙️</button>
                <button class="btn-secondary btn-sm" onclick="savePreset()">💾 Group</button>
            </div>
        </div>
        <div class="row" style="margin:10px 0;">
            <input type="text" id="nameInput" placeholder="Name" onkeydown="if(event.key==='Enter') addPlayer()">
            <button class="btn-primary" style="width:auto;" onclick="addPlayer()">${t('add')}</button>
        </div>
        <button class="btn-secondary btn-sm" onclick="toggleAutoNames()" style="width:100%; justify-content:center; opacity:0.8; margin-bottom:10px;">
            ${isAutoNamesExpanded ? t('hideSuggestions') : t('showSuggestions')}
        </button>
        ${isAutoNamesExpanded ? `<div class="chip-container">${AUTO_NAMES.map(n => {
            const isAdded = state.players.some(p => p.name.toLowerCase() === n.toLowerCase());
            return `<button class="chip-btn ${isAdded ? 'added' : ''}" onclick="addPlayer('${n}')">${n}</button>`;
        }).join('')}</div>` : ''}
        <div style="margin-top:auto;">
            <button class="btn-primary" onclick="openGameSettings()" ${state.players.length < 2 ? 'disabled' : ''}>
                ${state.players.length < 2 ? '2+ Players' : t('configure')}
            </button>
            ${viewMode === 'mobile' ? `<div style="text-align:center; margin:10px 0; opacity:0.5;">— OR —</div><button class="btn-secondary" onclick="startPassGame()" ${state.players.length < 2 ? 'disabled' : ''}>📱 ${t('passPlay')}</button>` : ''}
        </div>`;

    const rosterHtml = `<div class="list-wrap">${state.players.map((p, i) => `
        <div class="item-card"><span>${p.name}</span><button class="btn-danger btn-icon" onclick="removePlayer(${i})">✕</button></div>`).join('')}</div>`;

    app.innerHTML = `${switchBtn}<div class="split-container"><div class="left-panel">${leftContent}</div>${viewMode === 'tv' ? `<div class="right-panel"><div class="game-status-panel"><h3>Current Roster</h3>${rosterHtml}</div></div>` : `<div>${rosterHtml}</div>`}</div>`;
    if(viewMode === 'tv') document.body.classList.add('is-tv-mode');
}

function renderDistribute() {
    let timeText = `0:00`;
    const sec = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    if (state.settings.timerMode === 'down') timeText = formatTime(Math.max(0, state.settings.duration - sec));
    else timeText = formatTime(sec);

    // FIREBASE URL GENERATION
    let roomUrl = window.location.href.split('?')[0];
    if (db && window.currentRoomId) {
        roomUrl += `?roomId=${window.currentRoomId}`;
    }

    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()">👁️</button>`;
    const controlsHtml = `
        <div style="text-align:center;"><div id="timerDisplay" class="timer-badge">⏱️ ${timeText}</div></div>
        <h2>${t('distribute')}</h2>
        <div style="text-align:center; margin-top:20px;">
            <button class="btn-primary" onclick="startVerification()">${t('verify')}</button>
            <button class="btn-secondary" style="margin-top:10px;" onclick="setState('SETUP')">Back</button>
        </div>
        ${db ? `<div style="text-align:center; margin-top:20px; font-size:0.8rem; opacity:0.7">🔥 Live Session: ${window.currentRoomId || 'Creating...'}</div>` : ''}
        ${!db && viewMode === 'tv' ? `<button class="btn-secondary" style="margin-top:10px;" onclick="openQrGrid()">📺 Grid View</button>` : ''}
    `;

    // If Firebase, show Main QR
    let listHtml = '';
    if (db && window.currentRoomId) {
        // Create Room logic
        if (!window.qrGenerated) {
            setTimeout(() => {
                const c = document.getElementById('mainRoomQr');
                if(c) new QRCode(c, { text: roomUrl, width: 250, height: 250 });
            }, 100);
            window.qrGenerated = true;
        }
        listHtml = `<div style="text-align:center; padding:20px;"><div id="mainRoomQr" style="display:inline-block; background:white; padding:10px;"></div><p style="margin-top:10px">Scan to Join Session</p></div>`;
    } else {
        // Legacy Manual Links
        const baseUrl = window.location.href.split('?')[0];
        listHtml = `<div class="list-wrap">${state.players.map(p => {
             const payload = btoa(JSON.stringify({ n: p.name, v: p.number, min: state.settings.min, max: state.settings.max, o: state.settings.order }));
             const link = `${baseUrl}?p=${payload}`;
             return `<div class="item-card"><span style="font-weight:800;">${p.name}</span><button class="btn-secondary btn-icon" onclick="showQr('${link}', '${p.name}')">🏁</button></div>`;
        }).join('')}</div>`;
    }

    if (viewMode === 'tv') app.innerHTML = `${switchBtn}<div class="split-container"><div class="left-panel">${controlsHtml}</div><div class="right-panel"><div class="game-status-panel"><h3>Links</h3>${listHtml}</div></div></div>`;
    else app.innerHTML = `${switchBtn}${controlsHtml}${listHtml}`;

    // Create Firebase Room if needed
    if (db && !window.currentRoomId && viewMode === 'tv') {
        createFirebaseRoom().then(() => render());
    }
    
    startTimerTicker();
}

function renderPassPlay() {
    const p = state.players[state.passIndex];
    if (!state.viewingNumber) {
        app.innerHTML = `<button class="top-left-btn" onclick="resetViewMode()">👁️</button><div style="text-align:center; margin-top:20px;"><h2>Pass to<br><span style="color:var(--primary); font-size:2.5rem;">${p.name}</span></h2><button class="btn-primary" onclick="state.viewingNumber=true; saveState(); render()">I am ${p.name}</button></div>`;
    } else {
        app.innerHTML = `<button class="top-left-btn" onclick="resetViewMode()">👁️</button><div style="text-align:center;"><h2>Hi, ${p.name}!</h2><p>Tap & hold.</p></div><div class="secret-container" id="secretBox"><div class="secret-overlay">HOLD</div><div class="big-number secret-blur">${p.number}</div></div><button class="btn-primary" onclick="nextPassPlayer()">Next Player</button>`;
        bindSecretBox();
    }
}

function renderVerify() {
    if (!state.startTime) state.startTime = Date.now();
    let timeText = `0:00`;
    const sec = Math.floor((Date.now() - state.startTime) / 1000);
    if (state.settings.timerMode === 'down') timeText = formatTime(Math.max(0, state.settings.duration - sec));
    else timeText = formatTime(sec);

    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()">👁️</button>`;
    const controlsHtml = `<div style="text-align:center;"><div id="timerDisplay" class="timer-badge">⏱️ ${timeText}</div></div><div style="display:flex; justify-content:space-between;"><h2>${t('verify')}</h2><button class="btn-secondary btn-icon" onclick="toggleGodMode()">${godMode ? '🔓' : '🔒'}</button></div>${viewMode === 'tv' ? `<button class="btn-primary" style="background:var(--success); margin-top:20px" onclick="checkOrder()">Results</button>` : ''}`;

    const listHtml = `<div class="list-wrap">${state.players.map((p, i) => {
        const isSelected = movingPlayerIndex === i;
        const isTarget = movingPlayerIndex !== null;
        if (isTarget && !isSelected) return `<div class="item-card"><button class="btn-place-here" onclick="finishMove(${i})">👇 Place Here</button></div>`;
        return `<div class="item-card ${isSelected ? 'is-moving' : ''}"><div style="display:flex;"><div class="rank-badge">${i+1}</div><span>${p.name}</span>${godMode?` (${p.number})`:''}</div><button class="btn-move-select" onclick="startMove(${i})">${isSelected?'✕':'↕️'}</button></div>`;
    }).join('')}</div>`;

    if (viewMode === 'tv') app.innerHTML = `${switchBtn}<div class="split-container"><div class="left-panel">${controlsHtml}</div><div class="right-panel"><div class="game-status-panel"><h3>Current Order</h3>${listHtml}</div></div></div>`;
    else app.innerHTML = `${switchBtn}${controlsHtml}${listHtml}`;
    startTimerTicker();
}

function startMove(index) { movingPlayerIndex = (movingPlayerIndex === index) ? null : index; render(); }
function finishMove(target) { if (movingPlayerIndex === null) return; const p = state.players.splice(movingPlayerIndex, 1)[0]; state.players.splice(target, 0, p); movingPlayerIndex = null; saveState(); render(); playSfx('add'); }

function checkOrder() { state.revealedCount = 0; setState('RESULTS'); startAutoReveal(); pulse(50); }

function renderResults() {
    clearInterval(timerInterval);
    const sorted = [...state.players].sort((a, b) => state.settings.order === 'asc' ? a.number - b.number : b.number - a.number);
    const mvpName = getMvpName(state.players, sorted);
    const listItems = state.players.map((p, i) => getResultCardHtml(p, i, sorted, mvpName, i < state.revealedCount)).join('');
    
    if (!state.finalTime) {
        state.finalTime = Math.floor((Date.now() - state.startTime) / 1000); 
        updateScores(); saveHistory(state.players.every((p, i) => p.name === sorted[i].name));
    }
    
    const allRev = state.revealedCount >= state.players.length;
    const header = `<h1>${allRev ? t('results') : 'Revealing...'}</h1>`;
    const listHtml = `<div class="list-wrap">${listItems}</div>`;
    const btns = allRev ? `<button class="btn-primary" onclick="restartSamePlayers()">🔄 Replay</button><button class="btn-secondary" onclick="resetGameData()">New Game</button>` : `<button class="btn-secondary" onclick="state.revealedCount=999; render()">Skip</button>`;

    if(viewMode === 'tv') app.innerHTML = `<div class="split-container"><div class="left-panel" style="justify-content:center;">${header}<br>${btns}</div><div class="right-panel"><div class="game-status-panel"><h3>Results</h3>${listHtml}</div></div></div>`;
    else app.innerHTML = `${header}${listHtml}${btns}`;
}

function getResultCardHtml(p, i, sorted, mvpName, isRevealed) {
    if (!isRevealed) return `<div class="item-card pending"><div style="display:flex;"><div class="rank-badge">${i+1}</div>Hidden</div></div>`;
    const isCorrect = p.name === sorted[i].name; 
    return `<div class="item-card ${isCorrect?'correct':'wrong'} ${p.name===mvpName?'gold':''}"><div><div style="display:flex;"><div class="rank-badge">${i+1}</div><strong>${p.name}</strong></div><div style="font-size:0.8rem; margin-left:30px;">#${p.number}</div></div><div style="font-size:1.5rem;">${isCorrect?'✅':'❌'}</div></div>`;
}

function getMvpName(players, sorted) {
    // Simplified MVP for brevity
    const correct = players.filter((p, i) => p.name === sorted[i].name);
    return correct.length > 0 ? correct[0].name : (players[0]?.name || "");
}

function startAutoReveal() {
    if (revealInterval) return;
    revealInterval = setInterval(() => {
        if (state.revealedCount >= state.players.length) { clearInterval(revealInterval); revealInterval = null; render(); return; }
        state.revealedCount++; saveState(); playSfx('popup'); 
        render(); // Use full render for simplicity in this version
    }, 1500);
}

// --- PLAYER & ROOM VIEWS (NEW) ---
function renderRoomPickList(remoteState) {
    const unclaimed = remoteState.players; // In a real app, track 'claimed' status in DB
    app.innerHTML = `<h1>Select Name</h1><div class="list-wrap">${unclaimed.map(p => `
        <button class="btn-secondary" style="margin-bottom:10px; justify-content:space-between;" 
            onclick="claimFirebasePlayer('${p.name}')">
            <strong>${p.name}</strong> 👉
        </button>`).join('')}</div>`;
}

function claimFirebasePlayer(name) {
    sessionStorage.setItem('lineUpMyName', name);
    // Trigger update immediately
    // In real firebase app, you might want to mark this name as 'taken' in the DB
    render();
}

function renderRealTimePlayerView(myData, settings) {
    // If waiting for start
    if (myData.number === 0) {
        app.innerHTML = `<div style="text-align:center; padding:50px;"><h2>Welcome, ${myData.name}</h2><p>Waiting for host to launch...</p></div>`;
        return;
    }

    app.innerHTML = `
        <div style="text-align:center;"><h2>Hi, ${myData.name}!</h2><p>Tap & hold.</p></div>
        <div class="secret-container" id="secretBox"><div class="secret-overlay">HOLD</div><div class="big-number secret-blur">${myData.number}</div></div>
        <div style="background:var(--bg-item); padding:20px; border-radius:16px;">Range: <strong>${settings.min} - ${settings.max}</strong></div>
    `;
    bindSecretBox();
}

function renderPlayerView(encoded) {
    try {
        const data = JSON.parse(atob(encoded));
        app.innerHTML = `<div style="text-align:center;"><h2>Hi, ${data.n}!</h2><div class="secret-container" id="secretBox"><div class="secret-overlay">HOLD</div><div class="big-number secret-blur">${data.v}</div></div></div>`;
        bindSecretBox();
    } catch(e) { app.innerHTML = "Error"; }
}
function renderRoomView(encoded) {
    try {
        const d = JSON.parse(atob(encoded));
        app.innerHTML = `<div class="list-wrap">${d.players.map(p => `<button class="btn-secondary" onclick="window.location.href='?p=${btoa(JSON.stringify({...p, min:d.min, max:d.max}))}'">${p.n} 👉</button>`).join('')}</div>`;
    } catch(e) { app.innerHTML = "Error"; }
}

function bindSecretBox() {
    const box = document.getElementById('secretBox');
    if(!box) return;
    const rev = (e) => { e.preventDefault(); if(!box.classList.contains('revealed')) playSfx('popup'); box.classList.add('revealed'); pulse(); };
    const hide = (e) => { e.preventDefault(); box.classList.remove('revealed'); };
    ['touchstart','mousedown'].forEach(e => box.addEventListener(e, rev));
    ['touchend','mouseup','mouseleave'].forEach(e => box.addEventListener(e, hide));
}

function copyLink(url) { navigator.clipboard.writeText(url); showToast("Copied!"); pulse(); }
async function shareLink(url, name) { try { await navigator.share({ title: 'Line Up', text: name, url }); } catch(e) { copyLink(url); } }
function showQr(url, name) { openModal('qrModal'); document.getElementById('qrName').textContent = name; new QRCode(document.getElementById('qrDisplay'), { text: url, width: 200, height: 200 }); }
function openQrGrid() { openModal('qrGridModal'); const t = document.getElementById('qrGridTarget'); t.innerHTML = ''; state.players.forEach(p => { const d = document.createElement('div'); d.className = 'qr-card'; d.innerHTML = `<div>${p.name}</div><div id="qr-${p.name}"></div>`; t.appendChild(d); new QRCode(document.getElementById(`qr-${p.name}`), { text: window.location.href, width: 128, height: 128 }); }); }
function openRoomQr() { openModal('roomQrModal'); new QRCode(document.getElementById('roomQrDisplay'), { text: window.location.href, width: 200, height: 200 }); }

// Init
initSnow(); 
initScreensaver(); // Init Screensaver
loadState(); 
playSfx('start'); 
if(state.step !== 'SETUP' && !viewMode) viewMode = 'mobile';
if(viewMode === 'tv') document.body.classList.add('is-tv-mode');
render();
