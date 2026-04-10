// ===== DISPLAY MODE LOGIC =====
// Receives commands from Controller via Supabase Realtime broadcast.
// No local controls — fully remote-driven.

(() => {
    const pid = sessionStorage.getItem('pid');
    if (!pid) { window.location.href = 'index.html'; return; }

    // ===== STATE =====
    let sections = JSON.parse(JSON.stringify(TimerEngine.DEFAULT_SECTIONS));
    let sectionIndex = 0;
    let timerRunning = false;
    let startedAtTimestamp = 0;  // Date.now() when controller pressed start
    let priorTotalElapsed = 0;  // ms elapsed before this "run"
    let priorSectionElapsed = 0;
    let totalElapsedMs = 0;
    let sectionElapsedMs = 0;
    let rafId = null;

    // ===== DOM =====
    const $ = id => document.getElementById(id);
    const panelLeft = $('panelLeft');
    const panelRight = $('panelRight');
    const totalElapsedEl = $('totalElapsed');
    const totalRemainingEl = $('totalRemaining');
    const totalCueEl = $('totalCue');
    const sectionIndicatorEl = $('sectionIndicator');
    const sectionNameEl = $('sectionName');
    const sectionTimeEl = $('sectionTime');
    const cueTextEl = $('cueText');
    const statusDot = $('statusDot');
    const statusText = $('statusText');
    const pidLabel = $('pidLabel');
    const toastEl = $('toast');

    pidLabel.textContent = pid;

    // ===== RENDERING =====
    function setCueClass(el, color) {
        el.classList.remove('cue-blue', 'cue-green', 'cue-orange', 'cue-red');
        el.classList.add('cue-' + color);
    }

    function render() {
        const state = TimerEngine.computeState(sections, totalElapsedMs, sectionIndex, sectionElapsedMs);

        // Left panel — total
        totalElapsedEl.textContent = TimerEngine.formatTime(state.totalElapsedMs);
        totalRemainingEl.textContent = TimerEngine.formatTime(state.totalRemaining, true);
        setCueClass(panelLeft, state.totalCue.color);
        totalCueEl.textContent = state.totalCue.label;

        if (state.totalOvertime) {
            totalRemainingEl.classList.add('overtime');
            totalElapsedEl.classList.add('overtime');
        } else {
            totalRemainingEl.classList.remove('overtime');
            totalElapsedEl.classList.remove('overtime');
        }

        // Right panel — section
        sectionIndicatorEl.textContent = `Section ${state.sectionIndex + 1} of ${state.sectionCount}`;
        sectionNameEl.textContent = state.section.name;
        sectionTimeEl.textContent = TimerEngine.formatTime(state.sectionRemaining, true);
        setCueClass(panelRight, state.sectionCue.color);
        cueTextEl.textContent = state.sectionCue.label;

        if (state.sectionOvertime) {
            sectionTimeEl.classList.add('overtime');
            cueTextEl.classList.add('overtime');
        } else {
            sectionTimeEl.classList.remove('overtime');
            cueTextEl.classList.remove('overtime');
        }
    }

    // ===== TIMER LOOP (RAF for smooth ms rendering) =====
    function tick() {
        if (!timerRunning) return;
        const now = Date.now();
        totalElapsedMs = priorTotalElapsed + (now - startedAtTimestamp);
        sectionElapsedMs = priorSectionElapsed + (now - startedAtTimestamp);
        render();
        rafId = requestAnimationFrame(tick);
    }

    function startLocal(startedAt, priorTotal, priorSection, secIdx) {
        sectionIndex = secIdx;
        startedAtTimestamp = startedAt;
        priorTotalElapsed = priorTotal;
        priorSectionElapsed = priorSection;
        timerRunning = true;
        statusDot.className = 'status-dot';
        statusText.textContent = 'Running — synced';
        tick();
    }

    function pauseLocal(totalMs, sectionMs, secIdx) {
        timerRunning = false;
        if (rafId) cancelAnimationFrame(rafId);
        sectionIndex = secIdx;
        totalElapsedMs = totalMs;
        sectionElapsedMs = sectionMs;
        statusDot.className = 'status-dot waiting';
        statusText.textContent = 'Paused';
        render();
    }

    function resetLocal() {
        timerRunning = false;
        if (rafId) cancelAnimationFrame(rafId);
        sectionIndex = 0;
        totalElapsedMs = 0;
        sectionElapsedMs = 0;
        priorTotalElapsed = 0;
        priorSectionElapsed = 0;
        statusDot.className = 'status-dot waiting';
        statusText.textContent = 'Waiting for controller…';
        render();
    }

    // ===== TOAST AND FLASH =====
    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 2500);
    }

    function triggerFlash() {
        const flash = $('flashOverlay');
        if (!flash) return;
        flash.classList.add('active');
        setTimeout(() => {
            flash.classList.remove('active');
        }, 50);
    }

    // ===== SUPABASE REALTIME =====
    function setupRealtime() {
        const ok = SupaClient.init();

        // Register listeners BEFORE joinChannel (Supabase v2 requirement)
        SupaClient.on('timer:start', (p) => {
            startLocal(p.startedAt, p.priorTotalElapsed, p.priorSectionElapsed, p.sectionIndex);
            showToast('▶ Timer started');
        });

        SupaClient.on('timer:pause', (p) => {
            pauseLocal(p.totalElapsedMs, p.sectionElapsedMs, p.sectionIndex);
            showToast('⏸ Timer paused');
        });

        SupaClient.on('timer:reset', () => {
            resetLocal();
            showToast('🔄 Timer reset');
        });

        SupaClient.on('timer:flash', () => {
            triggerFlash();
        });

        SupaClient.on('timer:next', (p) => {
            sectionIndex = p.sectionIndex;
            sectionElapsedMs = p.sectionElapsedMs;
            totalElapsedMs = p.totalElapsedMs;
            priorSectionElapsed = p.sectionElapsedMs;
            priorTotalElapsed = p.totalElapsedMs;
            if (timerRunning) {
                startedAtTimestamp = Date.now();
            }
            render();
            showToast(`⏭ Section ${sectionIndex + 1}: ${sections[sectionIndex]?.name}`);
        });

        SupaClient.on('timer:prev', (p) => {
            sectionIndex = p.sectionIndex;
            sectionElapsedMs = p.sectionElapsedMs;
            totalElapsedMs = p.totalElapsedMs;
            priorSectionElapsed = p.sectionElapsedMs;
            priorTotalElapsed = p.totalElapsedMs;
            if (timerRunning) {
                startedAtTimestamp = Date.now();
            }
            render();
            showToast(`⏮ Section ${sectionIndex + 1}: ${sections[sectionIndex]?.name}`);
        });

        SupaClient.on('timer:config', (p) => {
            sections = p.sections;
            resetLocal();
            showToast('⚙ Config updated');
        });

        SupaClient.onConnection((status) => {
            if (status === 'SUBSCRIBED') {
                statusDot.className = 'status-dot';
                statusText.textContent = 'Connected (Supabase Realtime)';
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                statusDot.className = 'status-dot disconnected';
                statusText.textContent = 'Disconnected';
            }
        });

        if (ok) {
            SupaClient.joinChannel(pid);
        }

        // Always set up localStorage listener too (redundant cross-tab sync)
        setupOfflineSync();
    }

    // ===== OFFLINE CROSS-TAB SYNC via localStorage =====
    function setupOfflineSync() {
        if (!SupaClient.isConfigured()) {
            statusText.textContent = 'Connected (Local Network)';
        }
        window.addEventListener('storage', (e) => {
            if (e.key !== `timer_signal_${pid}`) return;
            try {
                const msg = JSON.parse(e.newValue);
                if (!msg) return;
                switch (msg.event) {
                    case 'timer:start':
                        startLocal(msg.payload.startedAt, msg.payload.priorTotalElapsed, msg.payload.priorSectionElapsed, msg.payload.sectionIndex);
                        break;
                    case 'timer:pause':
                        pauseLocal(msg.payload.totalElapsedMs, msg.payload.sectionElapsedMs, msg.payload.sectionIndex);
                        break;
                    case 'timer:reset':
                        resetLocal();
                        break;
                    case 'timer:next':
                    case 'timer:prev':
                        sectionIndex = msg.payload.sectionIndex;
                        sectionElapsedMs = msg.payload.sectionElapsedMs;
                        totalElapsedMs = msg.payload.totalElapsedMs;
                        priorSectionElapsed = msg.payload.sectionElapsedMs;
                        priorTotalElapsed = msg.payload.totalElapsedMs;
                        if (timerRunning) startedAtTimestamp = Date.now();
                        render();
                        break;
                    case 'timer:config':
                        sections = msg.payload.sections;
                        resetLocal();
                        break;
                    case 'timer:flash':
                        triggerFlash();
                        break;
                }
            } catch (err) { /* ignore */ }
        });

        // Check for initial config
        const configKey = `timer_active_config_${pid}`;
        const saved = localStorage.getItem(configKey);
        if (saved) {
            try {
                sections = JSON.parse(saved);
                render();
            } catch (e) { /* ignore */ }
        }
    }

    // ===== INIT =====
    render();
    setupRealtime();
})();
