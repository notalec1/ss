// --- CONFIG & STATE ---
const GOD_PASSWORD = "line1up";
const AUTO_NAMES = ["Alec", "Alain", "Nada", "Hoda", "Fadi", "Noa", "Gio", "Neo", "Nounou", "Assaad", "Chris", "Eliott"];

// !!! UPDATE THIS LIST WITH YOUR FILES, TITLES, AND ARTISTS !!!
const MUSIC_TRACKS = [
    { file: "chill_vibes.mp3", title: "Chill Vibes", artist: "LoFi Beats" },
    { file: "party_mix.mp3",   title: "Party Anthem", artist: "The DJ" },
    { file: "suspense.mp3",    title: "Suspense",     artist: "Movie Scores" }
];

const DEFAULT_STATE = { 
    step: 'SETUP', 
    players: [], 
    settings: { min: 1, max: 100, order: 'asc' }, 
    startTime: null, 
    finalTime: null, 
    passIndex: 0, 
    viewingNumber: false 
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let timerInterval = null;
let godMode = false;
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
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; 
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

// --- MUSIC SYSTEM ---
let currentTrackFile = null;

function openMusicModal() {
    const list = document.getElementById('musicList');
    
    if(MUSIC_TRACKS.length === 0) {
        list.innerHTML = `<p style="opacity:0.6; font-size:0.9rem;">No music found.<br>Update MUSIC_TRACKS in script.js</p>`;
    } else {
        list.innerHTML = MUSIC_TRACKS.map(track => {
            const isPlaying = currentTrackFile === track.file;
            return `
            <div class="item-card" style="margin-bottom:8px; cursor:pointer; ${isPlaying ? 'border-color:var(--primary); background:rgba(99, 102, 241, 0.1);' : ''}" onclick="playMusic('${track.file}')">
                <div style="display:flex; align-items:center; width:100%;">
                    <div style="font-size:1.5rem; margin-right:15px; width:30px; text-align:center;">
                        ${isPlaying ? '▶️' : '🎵'}
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-start;">
                        <span style="font-weight:900; font-size:1.1rem; color:var(--text-main);">${track.title}</span>
                        <span style="font-size:0.85rem; opacity:0.7; font-weight:600;">${track.artist}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    
    openModal('musicModal');
}

function playMusic(filename) {
    const audio = document.getElementById('bgAudio');
    
    // Find track info for Toast
    const trackInfo = MUSIC_TRACKS.find(t => t.file === filename);
    const displayName = trackInfo ? trackInfo.title : filename;

    if (currentTrackFile === filename && !audio.paused) {
        return; // Already playing
    }
    
    audio.src = `music/${filename}`;
    audio.volume = 0.5;
    audio.play().then(() => {
        currentTrackFile = filename;
        showToast("Playing: " + displayName);
        openMusicModal(); // Re-render to update icons
    }).catch(e => {
        console.error(e);
        showToast("Error: Check filename in script.js");
    });
}

function stopMusic() {
    const audio = document.getElementById('bgAudio');
    audio.pause();
    audio.currentTime = 0;
    currentTrackFile = null;
    openMusicModal(); // Re-render
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
            if ((state.step === 'DISTRIBUTE' || state.step === 'VERIFY') && state.startTime) startTimerTicker();
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
        } else {
            scores[p.name] = scores[p.name] || 0;
        }
    });

    if(changed) localStorage.setItem('lineUpLeaderboard', JSON.stringify(scores));
    return scores;
}

function resetScores() {
    if(confirm("Reset all player scores to 0?")) {
        localStorage.removeItem('lineUpLeaderboard');
        showToast("Scores Reset");
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
            showToast("Data Restored!");
            setTimeout(() => location.reload(), 1000);
        } catch(err) { showToast("Invalid File"); }
    };
    reader.readAsText(file);
}

function wipeData() {
    if(confirm("Are you sure? This deletes ALL history, groups, and settings.")) {
        localStorage.clear(); location.reload();
    }
}

// --- GAME LOGIC ---
function addPlayer(optionalName) {
    const input = document.getElementById('nameInput');
    const name = optionalName || input.value.trim();
    if (!name) return;
    // Prevent exact duplicates
    const exists = state.players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if(exists) return showToast("Already added!");
    
    state.players.push({ name, number: 0 });
    if(input) input.value = '';
    setState('SETUP');
    if(!optionalName) setTimeout(() => { const el = document.getElementById('nameInput'); if(el) el.focus(); }, 50);
    pulse();
}

function removePlayer(i) { state.players.splice(i, 1); setState('SETUP'); pulse(); }

function generateNumbers() {
    const minEl = document.getElementById('minInput');
    const maxEl = document.getElementById('maxInput');
    const min = parseInt(minEl ? minEl.value : state.settings.min);
    const max = parseInt(maxEl ? maxEl.value : state.settings.max);

    if (min >= max) { showToast("Min must be < Max!"); return false; }
    state.settings.min = min; state.settings.max = max;
    const orderEl = document.getElementById('orderInput');
    if(orderEl) state.settings.order = orderEl.value;

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
        state.startTime = Date.now(); state.finalTime = null;
        setState('DISTRIBUTE'); pulse(); requestWakeLock();
    }
}

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
    } else {
        state.startTime = Date.now(); setState('VERIFY');
    }
    pulse();
}

function restartSamePlayers() { state.startTime = null; state.finalTime = null; startGame(); }
function resetGameData() { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); saveState(); render(); }

// --- PRESETS & HISTORY ---
function savePreset() {
    if(state.players.length === 0) return showToast("No players");
    const name = prompt("Name this group:");
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
        showToast("Loaded!");
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
    el.innerHTML = log.map(g => `
        <div class="item-card" style="margin-bottom:8px; ${g.win ? 'border-color:var(--success)' : ''}">
            <div><div style="font-size:0.8rem; opacity:0.7">${g.date}</div><strong>${g.players} Players</strong></div>
            <div style="text-align:right;"><div style="font-weight:bold;">${g.time}</div><div>${g.win ? '✅' : '❌'}</div></div>
        </div>`).join('');
}

// --- MISC UTILS ---
function toggleGodMode() {
    if(godMode) { godMode = false; render(); } else { 
        if(prompt("Enter Admin Password:") === GOD_PASSWORD) { godMode = true; showToast("🔓 God Mode Active"); render(); } else { showToast("❌ Wrong Password"); } 
    }
}

function startTimerTicker() {
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const el = document.getElementById('timerDisplay');
        if(el && state.startTime) {
            const diff = Math.floor((Date.now() - state.startTime) / 1000);
            el.innerText = `⏱️ ${formatTime(diff)}`;
        }
    }, 1000);
}

function openModal(id) { 
    const m = document.getElementById(id); m.classList.add('active'); 
    if(id==='presetsModal') renderPresetsList(); 
    if(id==='historyModal') renderHistoryList(); 
    if(id==='leaderboardModal') {
        document.getElementById('mobileLeaderboardList').innerHTML = getLeaderboardHtml();
    }
    if(id==='musicModal') openMusicModal(); // Ensure music list renders
    pulse(); 
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); pulse(); }

// --- RENDER ENGINE ---
function setState(s) { state.step = s; saveState(); render(); }

function render() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('p')) { renderPlayerView(params.get('p')); return; }
    if (params.get('room')) { renderRoomView(params.get('room')); return; }

    // Mode Selection
    if (!viewMode) { renderModeSelection(); return; }

    // Host Mode
    if(state.step === 'SETUP') renderSetup();
    else if(state.step === 'DISTRIBUTE') renderDistribute();
    else if(state.step === 'PASS_PLAY') renderPassPlay();
    else if(state.step === 'VERIFY') renderVerify();
    else if(state.step === 'RESULTS') renderResults();
}

// --- COMPONENTS ---
function getLeaderboardHtml() {
    const scores = getLeaderboard();
    const entries = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    if (entries.length === 0) return `<div style="text-align:center; opacity:0.6">No scores yet</div>`;
    return entries.map((e, i) => `
        <div class="item-card" style="padding:10px 15px; margin-bottom:8px; border:none; background:rgba(255,255,255,0.5);">
            <div style="display:flex; align-items:center;">
                <span style="font-weight:900; width:25px; opacity:0.6;">${i+1}</span>
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
                Mobile / Host
            </button>
            <button class="mode-btn col" onclick="setViewMode('tv')">
                <div class="mode-icon">📺</div>
                TV Display
            </button>
        </div>
    `;
}

function renderSetup() {
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">↔️</button>`;
    const leftContent = `
        <h1>Line Up!</h1>
        <p>The Ultimate Party Game</p>
        <div class="row">
            <div class="col"><label class="label">Min</label><input type="number" id="minInput" value="${state.settings.min}"></div>
            <div class="col"><label class="label">Max</label><input type="number" id="maxInput" value="${state.settings.max}"></div>
        </div>
        <div style="margin-top:15px;">
            <label class="label">Sort Order</label>
            <select id="orderInput">
                <option value="asc" ${state.settings.order === 'asc' ? 'selected' : ''}>Smallest → Biggest</option>
                <option value="desc" ${state.settings.order === 'desc' ? 'selected' : ''}>Biggest → Smallest</option>
            </select>
        </div>
        <div class="divider"></div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <label class="label" style="margin:0;">Players (${state.players.length})</label>
            <div style="display:flex; gap:5px;">
                <button class="btn-secondary btn-sm" onclick="openModal('musicModal')">🎵</button>
                <button class="btn-secondary btn-sm" onclick="openModal('presetsModal')">💾</button>
                <button class="btn-secondary btn-sm" onclick="openModal('leaderboardModal')">🏆</button>
                <button class="btn-secondary btn-sm" onclick="openModal('dataModal')">⚙️</button>
                <button class="btn-secondary btn-sm" onclick="savePreset()">+Save</button>
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
            <button class="btn-primary" onclick="startGame()" ${state.players.length < 2 ? 'disabled' : ''}>${state.players.length < 2 ? 'Add Players to Start' : 'Generate Links'}</button>
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
                    <div class="leaderboard-panel"><h3>🏆 Total Scores</h3>${getLeaderboardHtml()}</div>
                </div>` 
            : `<div style="margin-top:10px">${rosterHtml}</div>`}
        </div>
    `;
    if(viewMode === 'tv') document.body.classList.add('is-tv-mode');
}

function renderDistribute() {
    const baseUrl = window.location.href.split('?')[0];
    const currentSeconds = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    const encodeData = (obj) => btoa(JSON.stringify(obj));
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">↔️</button>`;
    
    const timerHtml = `<div style="text-align:center;"><div id="timerDisplay" class="timer-badge">⏱️ ${formatTime(currentSeconds)}</div></div>`;
    const controlsHtml = `
        ${timerHtml}
        <h2>🔗 Distribute</h2>
        <div style="text-align:center; margin-top:20px;">
            <button class="btn-primary" onclick="setState('VERIFY')">Start Verification</button>
            <button class="btn-secondary" style="margin-top:10px;" onclick="setState('SETUP')">Back</button>
        </div>
        <div class="row" style="margin-top:15px;">
            ${viewMode === 'mobile' ? `<button class="btn-secondary" onclick="openModal('leaderboardModal')">🏆 Leaderboard</button>` : ''}
            <button class="btn-secondary" style="border-color:var(--primary); color:var(--primary)" onclick="openRoomQr()">🏠 Room Mode</button>
        </div>
        ${viewMode === 'tv' ? `<button class="btn-secondary" style="margin-top:10px;" onclick="openQrGrid()">📺 Grid View (All QRs)</button>` : ''}
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
                <div class="leaderboard-panel"><h3>🏆 Total Scores</h3>${getLeaderboardHtml()}</div>
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
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">↔️</button>`;
    
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
            <button class="btn-primary" onclick="nextPassPlayer()">${state.passIndex < state.players.length - 1 ? 'Next Player' : 'Go to Line Up!'}</button>
        `;
        bindSecretBox();
    }
}

function renderVerify() {
    if (!state.startTime) state.startTime = Date.now();
    const currentSeconds = Math.floor((Date.now() - state.startTime) / 1000);
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">↔️</button>`;
    
    const timerHtml = `<div style="text-align:center;"><div id="timerDisplay" class="timer-badge">⏱️ ${formatTime(currentSeconds)}</div></div>`;
    const controlsHtml = `
        ${timerHtml}
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>🧐 Verify</h2>
            <button class="btn-secondary btn-icon" style="width:36px; height:36px; font-size:1rem;" onclick="toggleGodMode()">${godMode ? '🔓' : '🔒'}</button>
        </div>
        ${viewMode === 'tv' ? 
          `<div style="margin-top:auto">
            <button class="btn-primary" style="background:var(--success); margin-bottom:10px" onclick="checkOrder()">Reveal Results</button>
            <button class="btn-secondary" onclick="setState('DISTRIBUTE')">Back</button>
           </div>` 
          : ''}
    `;

    const listHtml = `
        <div class="list-wrap">
            ${state.players.map((p, i) => `
                <div class="item-card" style="transition: transform 0.3s ease;">
                    <div style="display:flex; align-items:center;">
                        <div class="rank-badge">${i + 1}</div>
                        <div><span style="font-weight:700;">${p.name}</span>${godMode ? `<span style="margin-left:8px; color:var(--primary); font-weight:900;">(${p.number})</span>` : ''}</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-secondary btn-icon" onclick="movePlayer(${i}, -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button class="btn-secondary btn-icon" onclick="movePlayer(${i}, 1)" ${i === state.players.length - 1 ? 'disabled' : ''}>▼</button>
                    </div>
                </div>`).join('')}
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
                <div class="leaderboard-panel"><h3>🏆 Total Scores</h3>${getLeaderboardHtml()}</div>
            </div>
        </div>`;
    } else {
        app.innerHTML = `${switchBtn}${controlsHtml}${listHtml}`;
    }
    startTimerTicker();
}

function renderResults() {
    clearInterval(timerInterval);
    const sorted = [...state.players].sort((a, b) => state.settings.order === 'asc' ? a.number - b.number : b.number - a.number);
    let allCorrect = true; 
    const switchBtn = `<button class="top-left-btn" onclick="resetViewMode()" title="Switch View Mode">↔️</button>`;
    
    // MVP Logic
    let mvpName = ""; let bestDelta = Infinity;
    const min = state.settings.min; const max = state.settings.max; const total = state.players.length;
    if(total > 1) {
        state.players.forEach((p, actualIndex) => {
            const idealPercent = (p.number - min) / (max - min); 
            const idealIndex = idealPercent * (total - 1);
            const delta = Math.abs(actualIndex - idealIndex);
            if(delta < bestDelta) { bestDelta = delta; mvpName = p.name; }
        });
    }

    const listItems = state.players.map((p, i) => {
        const isCorrect = p.name === sorted[i].name; 
        if (!isCorrect) allCorrect = false;
        const realRank = sorted.findIndex(x => x.name === p.name) + 1; 
        const isMvp = p.name === mvpName;
        return `
            <div class="item-card ${isCorrect ? 'correct' : 'wrong'} ${isMvp ? 'gold' : ''}">
                <div>
                    <div style="display:flex; align-items:center;">
                        <div class="rank-badge" style="background:${isCorrect ? 'var(--success)' : 'var(--danger)'}; color:white;">${i+1}</div>
                        <strong>${p.name}</strong>${isMvp ? '<span style="margin-left:8px; font-size:0.8rem; background:var(--gold); color:white; padding:2px 6px; border-radius:4px;">⭐ MVP</span>' : ''}
                    </div>
                    <div style="font-size:0.85rem; margin-top:6px; margin-left:40px; opacity:0.8;">Number: <strong>${p.number}</strong>${!isCorrect ? `(Should be #${realRank})` : ''}</div>
                </div>
                <div style="font-size:1.5rem;">${isCorrect ? `✅<br><span style="font-size:0.6rem; font-weight:bold; color:var(--success)">+10pts</span>` : '❌'}</div>
            </div>`;
    }).join('');

    let timeMsg = "";
    if(allCorrect) {
        const duration = Math.floor((Date.now() - state.startTime) / 1000);
        if(!state.finalTime) { 
            state.finalTime = duration; saveState(); saveHistory(true); 
            updateScores(); // Add Points
            setTimeout(() => confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } }), 200); 
        }
        timeMsg = `<div class="timer-badge" style="background:var(--gold); color:white; animation: popIn 0.5s;">Time: ${formatTime(state.finalTime)}</div>`;
    } else if (!state.finalTime) { 
        state.finalTime = Math.floor((Date.now() - state.startTime) / 1000); 
        saveHistory(false); 
        updateScores(); // Add Points even if lost
    }

    const headerHtml = `<div style="text-align:center;">${timeMsg}</div><h1>${allCorrect ? '🎉 Perfect!' : '😬 Close!'}</h1>`;
    const buttonsHtml = `
        <button class="btn-primary" onclick="restartSamePlayers()">🔄 Play Again</button>
        <button class="btn-secondary" style="margin-top:10px;" onclick="resetGameData()">New Game</button>
    `;
    const listHtml = `<div class="list-wrap">${listItems}</div>`;
    const leaderboardHtml = `<div style="margin-top:20px; padding-top:20px; border-top:2px solid var(--border);">
        <h3>🏆 Total Scores</h3>${getLeaderboardHtml()}</div>`;

    if(viewMode === 'tv') {
        app.innerHTML = `
            ${switchBtn}
            <div class="split-container">
                <div class="left-panel" style="justify-content:center;">${headerHtml}<div style="margin-top:30px">${buttonsHtml}</div></div>
                <div class="right-panel">
                    <div class="game-status-panel"><h3>Results</h3>${listHtml}</div>
                    <div class="leaderboard-panel"><h3>🏆 Total Scores</h3>${getLeaderboardHtml()}</div>
                </div>
            </div>`;
    } else {
        app.innerHTML = `${switchBtn}${headerHtml}${listHtml}${leaderboardHtml}${buttonsHtml}`;
    }
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
    if (!data) return app.innerHTML = `<h2>Error</h2><p>Invalid Room Data</p>`;
    
    app.innerHTML = `
        <h2 style="margin-bottom:5px;">🏠 Pick Name</h2>
        <p>Tap your name to reveal your number</p>
        <div class="list-wrap">
            ${data.players.map(p => `
                <button class="btn-secondary" style="margin-bottom:10px; justify-content:space-between; padding:20px;" 
                    onclick="claimPlayer('${p.n}', ${p.v}, ${data.min}, ${data.max}, '${data.o}')">
                    <span style="font-weight:bold; font-size:1.1rem;">${p.n}</span>
                    <span>👉</span>
                </button>
            `).join('')}
        </div>
    `;
}

function claimPlayer(name, val, min, max, order) {
    const payload = { n: name, v: val, min: min, max: max, o: order };
    const encoded = btoa(JSON.stringify(payload));
    window.location.search = `?p=${encoded}`;
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
    const reveal = (e) => { if(e.cancelable) e.preventDefault(); box.classList.add('revealed'); pulse(5); };
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
    
    // Construct Room Payload (just names/numbers to keep URL short)
    const roomData = {
        players: state.players.map(p => ({n: p.name, v: p.number})),
        min: state.settings.min, 
        max: state.settings.max,
        o: state.settings.order
    };
    const baseUrl = window.location.href.split('?')[0];
    const url = `${baseUrl}?room=${btoa(JSON.stringify(roomData))}`;
    
    new QRCode(c, { text: url, width: 250, height: 250, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.L });
}

function checkOrder() { setState('RESULTS'); pulse(50); }

// Start
initSnow(); loadState(); 
if(state.step !== 'SETUP' && !viewMode) { viewMode = 'mobile'; }
if(viewMode === 'tv') document.body.classList.add('is-tv-mode');
render();
