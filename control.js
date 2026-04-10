// ===== CONTROL MODE LOGIC =====
// The "remote control" — broadcasts commands to Display & Teacher via Supabase Realtime.

const pid = sessionStorage.getItem('pid');
if (!pid) { window.location.href = 'index.html'; }

// ===== STATE =====
let sections = JSON.parse(JSON.stringify(TimerEngine.DEFAULT_SECTIONS));
let sectionIndex = 0;
let timerRunning = false;
let localStartedAt = 0;
let priorTotalElapsed = 0;
let priorSectionElapsed = 0;
let totalElapsedMs = 0;
let sectionElapsedMs = 0;
let rafId = null;
let tempSections = [];

// ===== DOM =====
const $ = id => document.getElementById(id);
const pidLabel = $('pidLabel');
const miniTotal = $('miniTotal');
const miniSection = $('miniSection');
const sectionBadge = $('sectionBadge');
const ctrlSectionName = $('ctrlSectionName');
const btnStart = $('btnStart');
const btnStartLabel = $('btnStartLabel');
const settingsOverlay = $('settingsOverlay');
const saveOverlay = $('saveOverlay');
const sectionListEl = $('sectionList');
const savedListEl = $('savedList');
const toastEl = $('toast');

pidLabel.textContent = pid;

// ===== RENDERING =====
function render() {
    const state = TimerEngine.computeState(sections, totalElapsedMs, sectionIndex, sectionElapsedMs);

    const totalDisp = TimerEngine.formatTime(state.totalRemaining, true);
    const secDisp = TimerEngine.formatTime(state.sectionRemaining, true);

    miniTotal.textContent = totalDisp;
    miniSection.textContent = secDisp;
    sectionBadge.textContent = `${state.sectionIndex + 1} / ${state.sectionCount}`;
    ctrlSectionName.textContent = state.section.name;

    miniTotal.classList.toggle('overtime', state.totalOvertime);
    miniSection.classList.toggle('overtime', state.sectionOvertime);
}

// ===== TIMER =====
function tick() {
    if (!timerRunning) return;
    const now = Date.now();
    totalElapsedMs = priorTotalElapsed + (now - localStartedAt);
    sectionElapsedMs = priorSectionElapsed + (now - localStartedAt);
    render();
    rafId = requestAnimationFrame(tick);
}

function toggleTimer() {
    if (timerRunning) pauseTimer();
    else startTimer();
}

function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    localStartedAt = Date.now();
    btnStart.classList.add('running');
    btnStart.querySelector('.ctrl-icon').textContent = '⏸';
    btnStartLabel.textContent = 'Pause';

    // Broadcast with timestamp for sync
    broadcastSignal('timer:start', {
        startedAt: localStartedAt,
        priorTotalElapsed,
        priorSectionElapsed,
        sectionIndex
    });

    tick();
}

function pauseTimer() {
    if (!timerRunning) return;
    timerRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    priorTotalElapsed = totalElapsedMs;
    priorSectionElapsed = sectionElapsedMs;
    btnStart.classList.remove('running');
    btnStart.querySelector('.ctrl-icon').textContent = '▶';
    btnStartLabel.textContent = 'Start';

    broadcastSignal('timer:pause', {
        totalElapsedMs,
        sectionElapsedMs,
        sectionIndex
    });

    render();
}

function resetTimer() {
    const wasRunning = timerRunning;
    timerRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    sectionIndex = 0;
    totalElapsedMs = 0;
    sectionElapsedMs = 0;
    priorTotalElapsed = 0;
    priorSectionElapsed = 0;
    btnStart.classList.remove('running');
    btnStart.querySelector('.ctrl-icon').textContent = '▶';
    btnStartLabel.textContent = 'Start';

    broadcastSignal('timer:reset', {});
    render();
    showToast('🔄 Timer reset');
}

function nextSection() {
    if (sectionIndex >= sections.length - 1) return;

    // Calculate what the new state should be
    const secDuration = TimerEngine.sectionDurationMs(sections[sectionIndex]);
    const overflow = Math.max(0, sectionElapsedMs - secDuration);
    sectionIndex++;
    sectionElapsedMs = overflow;
    priorSectionElapsed = overflow;

    if (timerRunning) {
        priorTotalElapsed = totalElapsedMs;
        localStartedAt = Date.now();
        priorSectionElapsed = overflow;
    }

    broadcastSignal('timer:next', {
        sectionIndex,
        sectionElapsedMs,
        totalElapsedMs
    });

    render();
    showToast(`⏭ ${sections[sectionIndex].name}`);
}

function prevSection() {
    if (sectionIndex <= 0) return;
    sectionIndex--;
    sectionElapsedMs = 0;
    priorSectionElapsed = 0;

    // Recalculate total elapsed
    totalElapsedMs = TimerEngine.elapsedBeforeSection(sections, sectionIndex);
    priorTotalElapsed = totalElapsedMs;

    if (timerRunning) {
        localStartedAt = Date.now();
    }

    broadcastSignal('timer:prev', {
        sectionIndex,
        sectionElapsedMs: 0,
        totalElapsedMs
    });

    render();
    showToast(`⏮ ${sections[sectionIndex].name}`);
}

// ===== BROADCAST =====
function broadcastSignal(event, payload) {
    // Always broadcast via Supabase if connected
    SupaClient.broadcast(event, payload);
    // Always write localStorage signal too (cross-tab fallback)
    localStorage.setItem(`timer_signal_${pid}`, JSON.stringify({
        event, payload, ts: Date.now()
    }));
}

function pingSync() {
    broadcastSignal('timer:flash', {});
    showToast('📡 Flash signal sent');
}

// ===== SETTINGS =====
function openSettings() {
    if (timerRunning) pauseTimer();
    tempSections = JSON.parse(JSON.stringify(sections));
    renderSettingsList();
    settingsOverlay.classList.add('active');
}

function closeSettings() {
    settingsOverlay.classList.remove('active');
}

function renderSettingsList() {
    sectionListEl.innerHTML = '';
    tempSections.forEach((sec, i) => {
        const item = document.createElement('div');
        item.className = 'section-item';
        item.innerHTML = `
      <span class="num">${i + 1}</span>
      <input type="text" value="${esc(sec.name)}" data-idx="${i}" class="sn-input" placeholder="Section name">
      <div class="dur">
        <input type="number" min="0" max="99" value="${sec.minutes}" data-idx="${i}" class="sm-input">
        <span>m</span>
        <input type="number" min="0" max="59" value="${sec.seconds}" data-idx="${i}" class="ss-input">
        <span>s</span>
      </div>
      <button class="btn-rm" data-idx="${i}">&times;</button>
    `;
        sectionListEl.appendChild(item);
    });

    sectionListEl.querySelectorAll('.sn-input').forEach(el => {
        el.addEventListener('input', e => { tempSections[+e.target.dataset.idx].name = e.target.value; });
    });
    sectionListEl.querySelectorAll('.sm-input').forEach(el => {
        el.addEventListener('input', e => { tempSections[+e.target.dataset.idx].minutes = Math.max(0, parseInt(e.target.value) || 0); });
    });
    sectionListEl.querySelectorAll('.ss-input').forEach(el => {
        el.addEventListener('input', e => { tempSections[+e.target.dataset.idx].seconds = Math.max(0, Math.min(59, parseInt(e.target.value) || 0)); });
    });
    sectionListEl.querySelectorAll('.btn-rm').forEach(el => {
        el.addEventListener('click', e => {
            const idx = +e.currentTarget.dataset.idx;
            if (tempSections.length > 1) { tempSections.splice(idx, 1); renderSettingsList(); }
        });
    });
}

function addSection() {
    tempSections.push({ name: `Section ${tempSections.length + 1}`, minutes: 1, seconds: 0 });
    renderSettingsList();
    sectionListEl.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
}

function saveSettings() {
    tempSections.forEach(s => {
        if (!s.name.trim()) s.name = 'Untitled';
        if (s.minutes === 0 && s.seconds === 0) s.seconds = 10;
    });
    sections = tempSections;
    resetTimer();
    closeSettings();

    // Push config to connected devices
    broadcastSignal('timer:config', { sections });

    // Save active config to localStorage for display offline pickup
    localStorage.setItem(`timer_active_config_${pid}`, JSON.stringify(sections));

    showToast('⚙ Sections updated');
}

// ===== SAVE / LOAD =====
function saveCurrentConfig() {
    $('saveNameInput').value = '';
    saveOverlay.classList.add('active');
    setTimeout(() => $('saveNameInput').focus(), 100);
}

function closeSaveDialog() {
    saveOverlay.classList.remove('active');
}

async function confirmSave() {
    const name = $('saveNameInput').value.trim() || 'Untitled';
    await SupaClient.saveConfig(pid, name, sections, true);
    closeSaveDialog();
    showToast(`💾 Saved "${name}"`);
    loadSavedConfigs();
}

async function loadSavedConfigs() {
    const configs = await SupaClient.loadConfigs(pid);
    if (configs.length === 0) {
        savedListEl.innerHTML = '<div class="empty-state">No saved timers yet</div>';
        return;
    }

    savedListEl.innerHTML = '';
    configs.forEach(cfg => {
        const item = document.createElement('div');
        item.className = 'saved-item';
        const secCount = Array.isArray(cfg.sections) ? cfg.sections.length : 0;
        const totalMs = Array.isArray(cfg.sections)
            ? cfg.sections.reduce((sum, s) => sum + TimerEngine.sectionDurationMs(s), 0) : 0;
        item.innerHTML = `
      <div>
        <div class="si-name">${esc(cfg.name)}</div>
        <div class="si-meta">${secCount} sections · ${TimerEngine.formatTimeShort(totalMs)}</div>
      </div>
      <div class="si-actions">
        <button class="si-btn load" title="Load">Load</button>
        <button class="si-btn del" title="Delete">✕</button>
      </div>
    `;
        item.querySelector('.load').addEventListener('click', () => {
            sections = JSON.parse(JSON.stringify(cfg.sections));
            resetTimer();
            broadcastSignal('timer:config', { sections });
            localStorage.setItem(`timer_active_config_${pid}`, JSON.stringify(sections));
            showToast(`📂 Loaded "${cfg.name}"`);
        });
        item.querySelector('.del').addEventListener('click', async () => {
            await SupaClient.deleteConfig(cfg.id);
            showToast('🗑 Deleted');
            loadSavedConfigs();
        });
        savedListEl.appendChild(item);
    });
}

// ===== HELPERS =====
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// ===== INIT =====
(async function init() {
    const ok = SupaClient.init();
    if (ok) {
        SupaClient.joinChannel(pid);
        await SupaClient.checkDbAvailability();
    }

    // Load saved & active config
    const activeConfig = localStorage.getItem(`timer_active_config_${pid}`);
    if (activeConfig) {
        try { sections = JSON.parse(activeConfig); } catch (e) { /* ignore */ }
    }

    render();
    await loadSavedConfigs();
})();
