// --- CONFIG & STATE ---
const GOD_PASSWORD = "line1up";
const AUTO_NAMES = ["Alec", "Alain", "Nada", "Hoda", "Fadi", "Noa", "Gio", "Neo", "Nounou", "Assaad", "Chris", "Eliott"];

// SFX Configuration
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
    // ADDED: timerMode ('up' or 'down') and duration (seconds)
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
const app = document.getElementById('app');

// --- UTILS ---
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
    if (params.has('p') || params.has('room')) return;
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
    if (!new URLSearchParams(window.location.search).has('p')) localStorage.setItem('lineUpState', JSON.stringify(state));
}

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
    if(confirm("Do you absolutely want to reset all player scores to 0?")) {
        localStorage.removeItem('lineUpLeaderboard');
        showToast("Scores Successfully Reset!");
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lineup-backup.json';
    a.click();
    showToast("Backup Downloaded");
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
            showToast("Data Successfully Restored!");
            loadState(); render(); closeModal('dataModal');
        } catch(err) { showToast("Invalid File. Make sure it's a JSON file."); }
    };
    reader.readAsText(file);
}

function wipeData() {
    if(confirm("Are you sure? This deletes ALL history, groups, and settings.")) {
        localStorage.clear(); 
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        render(); closeModal('dataModal'); showToast("Factory Reset Complete.");
    }
}

// --- GAME LOGIC ---
function addPlayer(optionalName) {
    const input = document.getElementById('nameInput');
    const name = optionalName || input.value.trim();
    if (!name) return;
    const exists = state.players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if(exists) return showToast("Player is already participating!");
    
    playSfx('add'); 
    state.players.push({ name, number: 0 });
    if(input) input.value = '';
    setState('SETUP');
    if(!optionalName) setTimeout(() => { const el = document.getElementById('nameInput'); if(el) el.focus(); }, 50);
    pulse();
}

function removePlayer(i) { state.players.splice(i, 1); setState('SETUP'); pulse(); }

// --- SETTINGS MODAL LOGIC ---
function openGameSettings() {
    if(state.players.length < 2) return showToast("Add 2+ players first!");
    
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
        upBtn.style.border = '2px solid var(--primary)';
        upBtn.style.opacity = '1';
        downBtn.style.border = '1px solid var(--border)';
        downBtn.style.opacity = '0.5';
        inputDiv.style.display = 'none';
    } else {
        downBtn.style.border = '2px solid var(--primary)';
        downBtn.style.opacity = '1';
        upBtn.style.border = '1px solid var(--border)';
        upBtn.style.opacity = '0.5';
        inputDiv.style.display = 'block';
    }
}

function adjustTime(amount) {
    const el = document.getElementById('settingDuration');
    let val = parseInt(el.value) + amount;
    if(val < 10) val = 10;
    el.value = val;
}

function generateNumbers() {
    const minEl = document.getElementById('settingMin');
    const maxEl = document.getElementById('settingMax');
    const orderEl = document.getElementById('settingOrder');
    const durationEl = document.getElementById('settingDuration');

    const min = parseInt(minEl.value);
    const max = parseInt(maxEl.value);

    if (min >= max) { showToast("Min must be < Max!"); return false; }
    
    state.settings.min = min; 
    state.settings.max = max;
    state.settings.order = orderEl.value;
    state.settings.duration = parseInt(durationEl.value);

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

function startVerification() {
    state.startTime = Date.now();
    setState('VERIFY');
}

function startPassGame() {
    if (state.players.length < 2) return showToast("Need 2+ players to start!");
    if (generateNumbers()) {
        state.passIndex = 0; state.viewingNumber = false; state.startTime = null;
        setState('PASS_PLAY'); pulse(); requestWakeLock();
    }
}

function nextPassPlayer() {
    if (state.passIndex < state.players.length - 1) {
        state.passIndex++; state.viewingNumber = false; saveState(); render();
    } else {
        startVerification(); 
    }
    pulse();
}

function restartSamePlayers() { state.startTime = null; state.finalTime = null; startGame(); }
function resetGameData() { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); saveState(); render(); }

// --- PRESETS & HISTORY ---
function savePreset() {
    if(state.players.length === 0) return showToast("No players");
    const name = prompt("What do you want to name this group?");
    if(name) {
        const presets = JSON.parse(localStorage.getItem('lineUpPresets')) || [];
        presets.push({ 
            name, 
            players: state.players.map(p => ({ name: p.name, number: 0 })),
            min: state.settings.min,
            max: state.settings.max
        });
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
        saveState();
        closeModal('presetsModal');
        render();
        showToast("Preset loaded!");
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
    if(presets.length === 0) { el.innerHTML = "<p>No saved groups. Click '+Save' to start.</p>"; return; }
    el.innerHTML = presets.map((p, i) => {
        const rangeInfo = (p.min !== undefined) ? `<br><small style="opacity:0.6">Range: ${p.min}-${p.max}</small>` : '';
        return `
        <div class="item-card" style="margin-bottom:8px;">
            <div><strong>${p.name}</strong> (${p.players.length})${rangeInfo}</div>
            <div style="display:flex; gap:5px;">
                <button class="btn-primary btn-sm" onclick="loadPreset(${i})">Load</button>
                <button class="btn-danger btn-sm" onclick="deletePreset(${i})">X</button>
            </div>
        </div>`;
    }).join('');
}

function saveHistory(win) {
    const log = JSON.parse(localStorage.getItem('lineUpHistory')) || [];
    log.unshift({
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
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
    if(log.length === 0) { el.innerHTML = "<p>No games played yet.</p>"; return; }
    el.innerHTML = log.map((g, index) => {
        const names = g.roster ? g.roster.join(', ') : 'No roster data (can be due to corruption).';
        return `
        <div class="item-card" 
             style="margin-bottom:8px; display:block; cursor:pointer; ${g.win ? 'border-color:var(--success)' : ''}" 
             onclick="const d = document.getElementById('hist-details-${index}'); d.style.display = d.style.display === 'none' ? 'block' : 'none'; pulse();">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div><div style="font-size:0.8rem; opacity:0.7">${g.date}</div><strong>${g.players} Players</strong></div>
                <div style="text-align:right;"><div style="font-weight:bold;">${g.time}</div><div>${g.win ? '✅' : '❌'}</div></div>
            </div>
            <div id="hist-details-${index}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); font-size:0.85rem; opacity:0.8;">
                <strong>Roster:</strong><br>${names}
            </div>
        </div>`;
    }).join('');
}

// --- MISC UTILS ---
function toggleGodMode() {
    if(godMode) { godMode = false; render(); } else { 
        if(prompt("Enter Admin Password:") === GOD_PASSWORD) { godMode = true; showToast("🔓 God Mode Active"); render(); } else { showToast("❌ Wrong Password!"); } 
    }
}

function startTimerTicker() {
    // UPDATED: Logic to handle Countdown, Auto-Reveal, and Red Overlay
    if(timerInterval) clearInterval(timerInterval);
    const overlay = document.getElementById('tensionOverlay');
    
    timerInterval = setInterval(() => {
        const el = document.getElementById('timerDisplay');
        
        if(el && state.startTime) {
            let diff = Math.floor((Date.now() - state.startTime) / 1000);
            
            // Countdown Logic
            if(state.settings.timerMode === 'down') {
                const remaining = state.settings.duration - diff;
                
                // Red Tension Effect (Intensifies as time reaches 0)
                if (remaining <= state.settings.duration && overlay) {
                   // Calculate intensity: 0 at start, 1 at end
                   const intensity = 1 - (remaining / state.settings.duration);
                   // Apply opacity (cap at 0.8 so it's not pitch black)
                   overlay.style.opacity = Math.max(0, Math.min(0.8, intensity));
                   
                   // Play tick sound in last 10 seconds
                   if (remaining <= 10 && remaining > 0 && theme.sfx) {
                       // Only tick once per second is tricky here without separate flag, 
                       // but simple implementation:
                       // We won't spam tick here to keep it simple, but the visual queue is strong.
                   }
                }

                if(remaining <= 0) {
                    // TIME UP!
                    clearInterval(timerInterval);
                    el.innerText = `⏱️ 0:00`;
                    
                    // Reset overlay immediately so results aren't red
                    if(overlay) overlay.style.opacity = 0;
                    
                    // Auto Reveal
                    if(state.step !== 'RESULTS') {
                        checkOrder(); 
                    }
                    return; 
                }
                
                el.innerText = `⏱️ ${formatTime(remaining)}`;
            } else {
                // Stopwatch Mode
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
    if(id==='leaderboardModal') {
        document.getElementById('mobileLeaderboardList').innerHTML = getLeaderboardHtml();
    }
    if(id==='themeModal') applyTheme();
    pulse(); 
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); pulse(); }

// --- RENDER ENGINE ---
function setState(s) { 
    state.step = s; 
    saveState(); 
    
    // Reset overlay if leaving game loop
    const overlay = document.getElementById('tensionOverlay');
    if (s === 'SETUP' || s === 'RESULTS') {
        if(overlay) overlay.style.opacity = 0;
    }
    
    render(); 
}

function render() {
    const params = new URLSearchParams(window.location.search);
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
    if (entries.length === 0) return `<div style="text-align:center; opacity:0.6">No scores yet. Win a game to get started!</div>`;
    return entries.map((e, i) => `
        <div class="item-card" style="padding:10px 15px; margin-bottom:8px; border:none; background:rgba(255,255,255,0.5);">
            <div style="display:flex; align-items:center;">
                <span style="font-weight:900; min-width:30px; margin-right:8px; display:inline-block; opacity:0.6;">${i+1}</span>
                <span style="font-weight:700;">${e[0]}</span>
            </div>
            <strong style="color:var(--primary-dark)">${e[1]} pts</strong>
        </div>
    `).join('');
}

function renderModeSelection() {
    app.innerHTML = `
        <h1>Welcome</h1>
        <p>Choose your display mode</p>
        <div class="row" style="margin-top:20px;">
            <button class="mode-btn col" onclick="setViewMode('mobile')">
                <div class="mode-icon">📱</div>
                Small
            </button>
            <button class="mode-btn col" onclick="setViewMode('tv')">
                <div class="mode-icon">📺</div>
                Big / TV
            </button>
        </div>
    `;
}

function renderSetup() {
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">👁️</button>`;
    const leftContent = `
        <h1>Line Up!</h1>
        <p>The Ultimate Chaos Number Game</p>
        
        <div class="divider"></div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <label class="label" style="margin:0;">Players (${state.players.length})</label>
            <div style="display:flex; gap:5px;">
                <button class="btn-secondary btn-sm" onclick="openModal('presetsModal')">💾</button>
                <button class="btn-secondary btn-sm" onclick="openModal('leaderboardModal')">🏆</button>
                <button class="btn-secondary btn-sm" onclick="openModal('historyModal')">📜</button>
                <button class="btn-secondary btn-sm" onclick="openModal('themeModal'); applyTheme();">🎨</button>
                <button class="btn-secondary btn-sm" onclick="openModal('dataModal')">⚙️</button>
                <button class="btn-secondary btn-sm" onclick="savePreset()">Save Group</button>
            </div>
        </div>
        <div class="row" style="margin-top:10px; margin-bottom:10px;">
            <input type="text" id="nameInput" placeholder="Name" onkeydown="if(event.key==='Enter') addPlayer()">
            <button class="btn-primary" style="width:auto;" onclick="addPlayer()">Add</button>
        </div>
        
        <div class="chip-container">
            ${AUTO_NAMES.map(n => {
                const isAdded = state.players.some(p => p.name.toLowerCase() === n.toLowerCase());
                return `<button class="chip-btn ${isAdded ? 'added' : ''}" onclick="addPlayer('${n}')">${n}</button>`;
            }).join('')}
        </div>
        
        <div style="margin-top:auto;">
            <button class="btn-primary" onclick="openGameSettings()" ${state.players.length < 2 ? 'disabled' : ''}>
                ${state.players.length < 2 ? '2+ Players to Start' : 'Go!'}
            </button>
            ${viewMode === 'mobile' ? `
            <div style="text-align:center; margin: 12px 0; font-size: 0.8rem; font-weight:800; opacity:0.5; letter-spacing:1px;">— OR —</div>
            <button class="btn-secondary" onclick="startPassGame()" ${state.players.length < 2 ? 'disabled' : ''}>📱 Pass & Play</button>` : ''}
        </div>
    `;

    const rosterHtml = `
        <div class="list-wrap">
            ${state.players.length === 0 ? '<div style="text-align:center; opacity:0.5; padding:20px;">Add players...</div>' : ''}
            ${state.players.map((p, i) => `
                <div class="item-card">
                    <span style="font-weight:700;">${p.name}</span>
                    <button class="btn-danger btn-icon" style="width:32px; height:32px; font-size:1rem;" onclick="removePlayer(${i})">✕</button>
                </div>
            `).join('')}
        </div>
    `;

    app.innerHTML = `
        ${switchBtn}
        <div class="split-container">
            <div class="left-panel">${leftContent}</div>
            ${viewMode === 'tv' ? `
                <div class="right-panel">
                    <div class="game-status-panel"><h3>Current Roster</h3>${rosterHtml}</div>
                </div>` 
            : `<div style="margin-top:10px">${rosterHtml}</div>`}
        </div>
    `;
    if(viewMode === 'tv') document.body.classList.add('is-tv-mode');
}

function renderDistribute() {
    const baseUrl = window.location.href.split('?')[0];
    const currentSeconds = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    
    // UPDATED: Pre-calculate time text so it doesn't say "Loading..."
    let timeText = `0:00`;
    if (state.settings.timerMode === 'down') {
        const remaining = Math.max(0, state.settings.duration - currentSeconds);
        timeText = formatTime(remaining);
    } else {
        timeText = formatTime(currentSeconds);
    }
    
    const encodeData = (obj) => btoa(JSON.stringify(obj));
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">👁️</button>`;
    
    const timerHtml = `<div style="text-align:center;"><div id="timerDisplay" class="timer-badge">⏱️ ${timeText}</div></div>`;
    const controlsHtml = `
        ${timerHtml}
        <h2>🔗 Distribute</h2>
        <div style="text-align:center; margin-top:20px;">
            <button class="btn-primary" onclick="startVerification()">Start Verification</button>
            <button class="btn-secondary" style="margin-top:10px;" onclick="setState('SETUP')">Back</button>
        </div>
        <div class="row" style="margin-top:15px;">
            ${viewMode === 'mobile' ? `<button class="btn-secondary" onclick="openModal('leaderboardModal')">🏆 Leaderboard</button>` : ''}
            <button class="btn-secondary" style="border-color:var(--primary); color:var(--primary)" onclick="openRoomQr()">🏠 Room Mode</button>
        </div>
        ${viewMode === 'tv' ? `<button class="btn-secondary" style="margin-top:10px;" onclick="openQrGrid()">📺 Grid View</button>` : ''}
    `;

    const listHtml = `
        <div class="list-wrap">
            ${state.players.map((p, i) => {
                const payload = { n: p.name, v: p.number, min: state.settings.min, max: state.settings.max, o: state.settings.order };
                const link = `${baseUrl}?p=${encodeData(payload)}`;
                return `
                <div class="item-card" style="flex-direction:column; gap:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <span style="font-weight:800;">${p.name}</span>
                        <span style="font-size:0.75rem; background:var(--primary); color:white; padding:4px 10px; border-radius:12px; font-weight:800;">HIDDEN</span>
                    </div>
                    <div class="row" style="width:100%; gap:8px;">
                        <button class="btn-secondary btn-icon" onclick="showQr('${link}', '${p.name}')">🏁</button>
                        <button class="btn-secondary btn-sm" style="flex:1" onclick="copyLink('${link}')">Copy</button>
                        <button class="btn-secondary btn-icon" onclick="shareLink('${link}', '${p.name}')">📤</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    if (viewMode === 'tv') {
        app.innerHTML = `${switchBtn}<div class="split-container">
            <div class="left-panel">${controlsHtml}</div>
            <div class="right-panel">
                <div class="game-status-panel"><h3>Links</h3>${listHtml}</div>
            </div>
        </div>`;
    } else {
        app.innerHTML = `${switchBtn}${controlsHtml}${listHtml}`;
    }
    startTimerTicker();
}

function renderPassPlay() {
    const p = state.players[state.passIndex];
    const orderText = state.settings.order === 'asc' ? 'Smallest ➔ Biggest' : 'Biggest ➔ Smallest';
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">👁️</button>`;
    
    if (!state.viewingNumber) {
        app.innerHTML = `
            ${switchBtn}
            <div style="text-align:center; margin-top:20px;">
                <h1 style="font-size:4rem; margin-bottom:20px;">📱</h1>
                <h2>Pass to<br><span style="color:var(--primary); font-size:2.5rem;">${p.name}</span></h2>
                <div class="divider"></div>
                <button class="btn-primary" onclick="state.viewingNumber=true; saveState(); render()">I am ${p.name}</button>
            </div>`;
    } else {
        app.innerHTML = `
            ${switchBtn}
            <div style="text-align:center;"><h2>Hi, ${p.name}!</h2><p>Tap & hold to reveal.</p></div>
            <div class="secret-container" id="secretBox"><div class="secret-overlay">HOLD</div><div class="big-number secret-blur">${p.number}</div></div>
            <div style="background:var(--bg-item); padding:15px; border-radius:16px; text-align:left; font-size:0.95rem; margin-bottom:20px;">
                Range: <strong>${state.settings.min} - ${state.settings.max}</strong><br>Order: <strong>${orderText}</strong>
            </div>
            <button class="btn-primary" onclick="nextPassPlayer()">${state.passIndex < state.players.length - 1 ? 'Next Player' : 'Finished: Go to Line Up!'}</button>
        `;
        bindSecretBox();
    }
}

function renderVerify() {
    if (!state.startTime) state.startTime = Date.now();
    const currentSeconds = Math.floor((Date.now() - state.startTime) / 1000);
    
    // UPDATED: Pre-calculate time text
    let timeText = `0:00`;
    if (state.settings.timerMode === 'down') {
        const remaining = Math.max(0, state.settings.duration - currentSeconds);
        timeText = formatTime(remaining);
    } else {
        timeText = formatTime(currentSeconds);
    }
    
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">👁️</button>`;
    
    const timerHtml = `<div style="text-align:center;"><div id="timerDisplay" class="timer-badge">⏱️ ${timeText}</div></div>`;
    const controlsHtml = `
        ${timerHtml}
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>🧐 Verify</h2>
            <button class="btn-secondary btn-icon" style="width:36px; height:36px; font-size:1rem;" onclick="toggleGodMode()">${godMode ? '🔓' : '🔒'}</button>
        </div>
        ${viewMode === 'tv' ? 
          `<div style="margin-top:auto">
            <button class="btn-primary" style="background:var(--success); margin-bottom:10px" onclick="checkOrder()">Reveal Results!</button>
            <button class="btn-secondary" onclick="setState('DISTRIBUTE')">Back</button>
           </div>` 
          : ''}
    `;

    const listHtml = `
        <div class="list-wrap">
            ${state.players.map((p, i) => {
                // MOVE LOGIC DISPLAY
                if (theme.controls === 'arrows') {
                    // LEGACY ARROWS
                    return `
                    <div class="item-card" style="transition: transform 0.3s ease;">
                        <div style="display:flex; align-items:center;">
                            <div class="rank-badge">${i + 1}</div>
                            <div><span style="font-weight:700;">${p.name}</span>${godMode ? `<span style="margin-left:8px; color:var(--primary); font-weight:900;">(${p.number})</span>` : ''}</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-secondary btn-icon" onclick="movePlayer(${i}, -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
                            <button class="btn-secondary btn-icon" onclick="movePlayer(${i}, 1)" ${i === state.players.length - 1 ? 'disabled' : ''}>▼</button>
                        </div>
                    </div>`;
                } else {
                    // MODERN TWO-TAP JUMP
                    const isSelected = movingPlayerIndex === i;
                    const isTargetMode = movingPlayerIndex !== null;
                    
                    if (isTargetMode && !isSelected) {
                        // TARGET STATE
                        return `
                        <div class="item-card" style="padding:10px;">
                            <button class="btn-place-here" onclick="finishMove(${i})">
                                👇 Place Here (#${i+1})
                            </button>
                        </div>`;
                    }
                    
                    // NORMAL STATE
                    return `
                    <div class="item-card ${isSelected ? 'is-moving' : ''}" style="transition: transform 0.2s ease;">
                        <div style="display:flex; align-items:center;">
                            <div class="rank-badge">${i + 1}</div>
                            <div><span style="font-weight:700;">${p.name}</span>${godMode ? `<span style="margin-left:8px; color:var(--primary); font-weight:900;">(${p.number})</span>` : ''}</div>
                        </div>
                        <div>
                            <button class="btn-move-select" style="${isSelected ? 'background:var(--danger); color:white; border-color:var(--danger);' : ''}" onclick="startMove(${i})">
                                ${isSelected ? '✕' : '↕️'}
                            </button>
                        </div>
                    </div>`;
                }
            }).join('')}
        </div>
        ${viewMode === 'mobile' ? `
        <button class="btn-primary" style="background:var(--success);" onclick="checkOrder()">Reveal Results</button>
        <button class="btn-secondary" style="margin-top:10px;" onclick="setState('DISTRIBUTE')">Back</button>` : ''}
    `;

    if (viewMode === 'tv') {
        app.innerHTML = `${switchBtn}<div class="split-container">
            <div class="left-panel">${controlsHtml}</div>
            <div class="right-panel">
                <div class="game-status-panel"><h3>Current Order</h3>${listHtml}</div>
            </div>
        </div>`;
    } else {
        app.innerHTML = `${switchBtn}${controlsHtml}${listHtml}`;
    }
    startTimerTicker();
}

// NEW: MOVE LOGIC FUNCTIONS
function startMove(index) {
    if (movingPlayerIndex === index) {
        movingPlayerIndex = null; // Cancel
    } else {
        movingPlayerIndex = index; // Select
    }
    render();
}

function finishMove(targetIndex) {
    if (movingPlayerIndex === null) return;
    
    // Splice logic: Remove from old, insert at new
    const player = state.players.splice(movingPlayerIndex, 1)[0];
    state.players.splice(targetIndex, 0, player);
    
    movingPlayerIndex = null;
    saveState();
    render();
    playSfx('add'); // Satisfying click sound
}

// NEW: Helper to generate card HTML (used by render and auto-reveal)
function getResultCardHtml(p, i, sorted, mvpName, isRevealed) {
    if (!isRevealed) {
        return `
        <div class="item-card pending" id="res-card-${i}">
            <div style="display:flex; align-items:center;">
                <div class="rank-badge" style="background:var(--text-sub); opacity:0.5;">${i+1}</div>
                <span style="font-weight:700; opacity:0.5;">Hidden</span>
            </div>
            <div style="opacity:0.5;">⏳</div>
        </div>`;
    }

    const isCorrect = p.name === sorted[i].name; 
    const realRank = sorted.findIndex(x => x.name === p.name) + 1; 
    const isMvp = p.name === mvpName;

    return `
        <div class="item-card just-revealed ${isCorrect ? 'correct' : 'wrong'} ${isMvp ? 'gold' : ''}" id="res-card-${i}">
            <div>
                <div style="display:flex; align-items:center;">
                    <div class="rank-badge" style="background:${isCorrect ? 'var(--success)' : 'var(--danger)'}; color:white;">${i+1}</div>
                    <strong>${p.name}</strong>${isMvp ? '<span style="margin-left:8px; font-size:0.8rem; background:var(--gold); color:white; padding:2px 6px; border-radius:4px;">⭐ MVP</span>' : ''}
                </div>
                <div style="font-size:0.85rem; margin-top:6px; margin-left:40px; opacity:0.8;">Number: <strong>${p.number}</strong>${!isCorrect ? ` (Should be #${realRank})` : ''}</div>
            </div>
            <div style="font-size:1.5rem;">${isCorrect ? `✅<br><span style="font-size:0.6rem; font-weight:bold; color:var(--success)">+10pts</span>` : '❌'}</div>
        </div>`;
}

function startAutoReveal() {
    if (revealInterval) return;
    
    // NEW MVP LOGIC: RANK-BASED
    const sorted = [...state.players].sort((a, b) => state.settings.order === 'asc' ? a.number - b.number : b.number - a.number);
    const mvpName = getMvpName(state.players, sorted);

    revealInterval = setInterval(() => {
        if (state.revealedCount >= state.players.length) {
            clearInterval(revealInterval);
            revealInterval = null;
            render(); // Final render to show buttons
            
            // Final check
            const allCorrect = state.players.every((p, i) => p.name === sorted[i].name);
            playSfx(allCorrect ? 'win' : 'lose');
            if(allCorrect) setTimeout(() => confetti({ particleCount: 650, spread: 180, origin: { y: 0.6 } }), 200);
            return;
        }
        
        state.revealedCount++;
        saveState();
        playSfx('popup'); 
        
        // --- SURGICAL DOM UPDATE (NO VOMIT) ---
        const cardIndex = state.revealedCount - 1;
        const player = state.players[cardIndex];
        const newHtml = getResultCardHtml(player, cardIndex, sorted, mvpName, true);
        
        const cardEl = document.getElementById(`res-card-${cardIndex}`);
        if(cardEl) {
            cardEl.outerHTML = newHtml;
            const newCard = document.getElementById(`res-card-${cardIndex}`);
            if(newCard) newCard.scrollIntoView({behavior: "smooth", block: "center"});
        }

    }, 1500); // 1.0s Speed --> 1.5s
}

function renderResults() {
    clearInterval(timerInterval);
    const sorted = [...state.players].sort((a, b) => state.settings.order === 'asc' ? a.number - b.number : b.number - a.number);
    
    const mvpName = getMvpName(state.players, sorted);

    const listItems = state.players.map((p, i) => {
        const isRevealed = i < state.revealedCount;
        return getResultCardHtml(p, i, sorted, mvpName, isRevealed);
    }).join('');

    if (!state.finalTime) {
        state.finalTime = Math.floor((Date.now() - state.startTime) / 1000); 
        const allCorrect = state.players.every((p, i) => p.name === sorted[i].name);
        saveHistory(allCorrect); 
        updateScores();
    }

    const allRevealed = state.revealedCount >= state.players.length;
    // Updated Time Badge logic
    let timeText = formatTime(state.finalTime);
    if(state.settings.timerMode === 'down' && state.finalTime > state.settings.duration) {
         timeText = "TIME UP!";
    }
    const timeMsg = `<div class="timer-badge" style="background:var(--gold); color:white;">Time: ${timeText}</div>`;
    const headerHtml = `<div style="text-align:center;">${timeMsg}</div><h1>${allRevealed ? 'Results' : 'Revealing...'}</h1>`;
    
    const buttonsHtml = allRevealed ? `
        <button class="btn-primary" onclick="restartSamePlayers()">🔄 Play Again</button>
        <button class="btn-secondary" style="margin-top:10px;" onclick="resetGameData()">New Game</button>
    ` : `
        <button class="btn-secondary" style="margin-top:10px; opacity:0.5" onclick="state.revealedCount=999; render()">Skip Animation</button>
    `;

    const listHtml = `<div class="list-wrap">${listItems}</div>`;
    // LEADERBOARD HTML REMOVED HERE

    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">👁️</button>`;

    if(viewMode === 'tv') {
        app.innerHTML = `
            ${switchBtn}
            <div class="split-container">
                <div class="left-panel" style="justify-content:center;">${headerHtml}<div style="margin-top:30px">${buttonsHtml}</div></div>
                <div class="right-panel">
                    <div class="game-status-panel"><h3>Results</h3>${listHtml}</div>
                </div>
            </div>`;
    } else {
        app.innerHTML = `${switchBtn}${headerHtml}${listHtml}${buttonsHtml}`;
    }
}

// NEW: Centralized MVP Logic
function getMvpName(players, sorted) {
    if(players.length < 2) return "";

    // 1. Identify Correct Players
    const correctPlayers = players.filter((p, i) => p.name === sorted[i].name);

    // 2. Logic A: Perfect/Correct Players (Who had the tightest squeeze?)
    if (correctPlayers.length > 0) {
        let bestName = "";
        let minDiff = Infinity;

        players.forEach((p, i) => {
            if (p.name !== sorted[i].name) return; // Skip incorrect players

            // Get absolute difference to neighbors in the SORTED list
            let gapPrev = Infinity;
            let gapNext = Infinity;

            if (i > 0) gapPrev = Math.abs(p.number - sorted[i-1].number);
            if (i < sorted.length - 1) gapNext = Math.abs(p.number - sorted[i+1].number);

            const difficulty = Math.min(gapPrev, gapNext);

            if (difficulty < minDiff) {
                minDiff = difficulty;
                bestName = p.name;
            }
        });
        return bestName;
    }

    // 3. Logic B: Everyone Wrong (Who was closest to their rank?)
    let bestName = "";
    let minRankDiff = Infinity;
    players.forEach((p, i) => {
        const sortedIndex = sorted.findIndex(s => s.name === p.name);
        const diff = Math.abs(i - sortedIndex);
        if (diff < minRankDiff) { 
            minRankDiff = diff; 
            bestName = p.name; 
        }
    });
    return bestName;
}

// --- PLAYER VIEWS ---
function renderPlayerView(encodedData) {
    let data = null;
    try { data = JSON.parse(atob(encodedData)); } catch(e) {}
    if (!data) return app.innerHTML = `<h2>Error</h2><p>Broken link.</p>`;
    app.innerHTML = `
        <div style="text-align:center;"><h2>Hi, ${data.n}!</h2><p>Tap & hold.</p></div>
        <div class="secret-container" id="secretBox"><div class="secret-overlay">HOLD</div><div class="big-number secret-blur">${data.v}</div></div>
        <div style="background:var(--bg-item); padding:20px; border-radius:16px; text-align:left; font-size:0.95rem;">Range: <strong>${data.min} - ${data.max}</strong></div>
    `;
    bindSecretBox();
}

function renderRoomView(encodedData) {
    let data = null;
    try { data = JSON.parse(atob(encodedData)); } catch(e) {}
    if (!data) return app.innerHTML = `<h2>Error.</h2><p>Invalid Room Data???</p>`;
    
    // ANTI-CHEAT CHECK
    if (data.id) {
        const claimedName = localStorage.getItem('lineUpClaim_' + data.id);
        if (claimedName) {
            const playerInfo = data.players.find(p => p.n === claimedName);
            if (playerInfo) {
                app.innerHTML = `
                    <div style="text-align:center; margin-top:30px;">
                        <h1 style="font-size:3rem;">🔒</h1>
                        <h2>Hi,<br>${claimedName}</h2>
                        <p>You have already selected your name.</p>
                        <div class="divider"></div>
                        <button class="btn-primary" onclick="claimPlayer('${playerInfo.n}', ${playerInfo.v}, ${data.min}, ${data.max}, '${data.o}', ${data.id})">
                            View My Number
                        </button>
                        <div style="margin-top:20px;">
                            <button class="btn-secondary btn-sm" onclick="if(confirm('Are you sure you want to switch names? This should only be done if you clicked by mistake. Cheating would just ruin the fun and game.')) { localStorage.removeItem('lineUpClaim_' + ${data.id}); render(); }">
                                Not ${claimedName}?
                            </button>
                        </div>
                    </div>
                `;
                return;
            }
        }
    }

    app.innerHTML = `
        <h2 style="margin-bottom:5px;">🏠 Pick Name</h2>
        <p>Tap YOUR name to reveal your number.</p>
        <div class="list-wrap">
            ${data.players.map(p => `
                <button class="btn-secondary" style="margin-bottom:10px; justify-content:space-between; padding:20px;" 
                    onclick="claimPlayer('${p.n}', ${p.v}, ${data.min}, ${data.max}, '${data.o}', ${data.id || 0})">
                    <span style="font-weight:bold; font-size:1.1rem;">${p.n}</span>
                    <span>👉</span>
                </button>
            `).join('')}
        </div>
    `;
}

function claimPlayer(name, val, min, max, order, roomId) {
    if (roomId) localStorage.setItem('lineUpClaim_' + roomId, name);
    const payload = { n: name, v: val, min: min, max: max, o: order };
    const encoded = btoa(JSON.stringify(payload));
    const newUrl = `${window.location.pathname}?p=${encoded}`;
    window.history.pushState({path: newUrl}, '', newUrl);
    render();
}

// --- INTERACTION ---
function movePlayer(index, dir) { 
    const target = index + dir; 
    if (target < 0 || target >= state.players.length) return; 
    [state.players[index], state.players[target]] = [state.players[target], state.players[index]]; 
    renderVerify(); saveState(); pulse(); 
}

function bindSecretBox() {
    const box = document.getElementById('secretBox');
    if(!box) return;
    const reveal = (e) => { 
        if(e.cancelable) e.preventDefault(); 
        if(!box.classList.contains('revealed')) playSfx('popup'); 
        box.classList.add('revealed'); pulse(5); 
    };
    const hide = (e) => { if(e.cancelable) e.preventDefault(); box.classList.remove('revealed'); };
    ['touchstart','mousedown'].forEach(e => box.addEventListener(e, reveal, {passive:false}));
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(e => box.addEventListener(e, hide));
}

function copyLink(url) { navigator.clipboard.writeText(url); showToast("Link copied!"); pulse(); }
async function shareLink(url, name) { pulse(); if (navigator.share) { try { await navigator.share({ title: 'Line Up!', text: `Number for ${name}`, url: url }); } catch (err) {} } else { copyLink(url); } }
function showQr(url, name) { pulse(); openModal('qrModal'); document.getElementById('qrName').textContent = name; const c = document.getElementById('qrDisplay'); c.innerHTML = ''; new QRCode(c, { text: url, width: 200, height: 200, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.L }); }

function openQrGrid() {
    openModal('qrGridModal');
    const target = document.getElementById('qrGridTarget');
    target.innerHTML = '';
    const baseUrl = window.location.href.split('?')[0];
    const encodeData = (obj) => btoa(JSON.stringify(obj));
    state.players.forEach(p => {
        const payload = { n: p.name, v: p.number, min: state.settings.min, max: state.settings.max, o: state.settings.order };
        const link = `${baseUrl}?p=${encodeData(payload)}`;
        const card = document.createElement('div');
        card.className = 'qr-card';
        card.innerHTML = `<div style="font-weight:800; margin-bottom:10px;">${p.name}</div><div id="qr-${p.name}"></div>`;
        target.appendChild(card);
        new QRCode(document.getElementById(`qr-${p.name}`), { text: link, width: 128, height: 128 });
    });
}

function openRoomQr() {
    openModal('roomQrModal');
    const c = document.getElementById('roomQrDisplay');
    c.innerHTML = '';
    const roomData = {
        id: Date.now(),
        players: state.players.map(p => ({n: p.name, v: p.number})),
        min: state.settings.min, 
        max: state.settings.max,
        o: state.settings.order
    };
    const baseUrl = window.location.href.split('?')[0];
    const url = `${baseUrl}?room=${btoa(JSON.stringify(roomData))}`;
    new QRCode(c, { text: url, width: 250, height: 250, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.L });
}

function checkOrder() { 
    state.revealedCount = 0; 
    setState('RESULTS'); 
    startAutoReveal(); // NEW: Start reveal immediately
    pulse(50); 
}

// Start
initSnow(); loadState(); 
playSfx('start'); 
if(state.step !== 'SETUP' && !viewMode) { viewMode = 'mobile'; }
if(viewMode === 'tv') document.body.classList.add('is-tv-mode');
render();
