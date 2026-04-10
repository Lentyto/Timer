// ===== TEACHER VIEW LOGIC =====
// Read-only view: receives Realtime broadcasts, no controls.

(() => {
    const pid = sessionStorage.getItem('pid');
    if (!pid) { window.location.href = 'index.html'; return; }

    let sections = JSON.parse(JSON.stringify(TimerEngine.DEFAULT_SECTIONS));
    let sectionIndex = 0;
    let timerRunning = false;
    let startedAtTimestamp = 0;
    let priorTotalElapsed = 0;
    let priorSectionElapsed = 0;
    let totalElapsedMs = 0;
    let sectionElapsedMs = 0;
    let rafId = null;

    const $ = id => document.getElementById(id);
    const teacherSection = $('teacherSection');
    const ttElapsed = $('ttElapsed');
    const ttRemaining = $('ttRemaining');
    const tsIndicator = $('tsIndicator');
    const tsName = $('tsName');
    const tsTime = $('tsTime');
    const tsCue = $('tsCue');
    const tsDot = $('tsDot');
    const tsStatus = $('tsStatus');

    function setCueClass(el, color) {
        el.classList.remove('cue-blue', 'cue-green', 'cue-orange', 'cue-red');
        el.classList.add('cue-' + color);
    }

    function triggerFlash() {
        const flash = $('flashOverlay');
        if (!flash) return;
        flash.classList.add('active');
        setTimeout(() => {
            flash.classList.remove('active');
        }, 50);
    }

    function render() {
        const state = TimerEngine.computeState(sections, totalElapsedMs, sectionIndex, sectionElapsedMs);

        // Top bar
        ttElapsed.textContent = TimerEngine.formatTime(state.totalElapsedMs);
        ttRemaining.textContent = TimerEngine.formatTime(state.totalRemaining, true);
        ttElapsed.classList.toggle('overtime', state.totalOvertime);
        ttRemaining.classList.toggle('overtime', state.totalOvertime);

        // Section area
        tsIndicator.textContent = `Section ${state.sectionIndex + 1} of ${state.sectionCount}`;
        tsName.textContent = state.section.name;
        tsTime.textContent = TimerEngine.formatTime(state.sectionRemaining, true);
        setCueClass(teacherSection, state.sectionCue.color);
        tsCue.textContent = state.sectionCue.label;

        tsTime.classList.toggle('overtime', state.sectionOvertime);
        tsCue.classList.toggle('overtime', state.sectionOvertime);
    }

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
        tsDot.className = 'sd';
        tsStatus.textContent = 'Running — synced';
        tick();
    }

    function pauseLocal(totalMs, sectionMs, secIdx) {
        timerRunning = false;
        if (rafId) cancelAnimationFrame(rafId);
        sectionIndex = secIdx;
        totalElapsedMs = totalMs;
        sectionElapsedMs = sectionMs;
        tsDot.className = 'sd waiting';
        tsStatus.textContent = 'Paused';
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
        tsDot.className = 'sd waiting';
        tsStatus.textContent = 'Waiting for controller…';
        render();
    }

    function setupRealtime() {
        const ok = SupaClient.init();

        // Register listeners BEFORE joinChannel
        SupaClient.on('timer:start', (p) => {
            startLocal(p.startedAt, p.priorTotalElapsed, p.priorSectionElapsed, p.sectionIndex);
        });
        SupaClient.on('timer:pause', (p) => {
            pauseLocal(p.totalElapsedMs, p.sectionElapsedMs, p.sectionIndex);
        });
        SupaClient.on('timer:reset', () => resetLocal());
        SupaClient.on('timer:flash', () => triggerFlash());
        SupaClient.on('timer:next', (p) => {
            sectionIndex = p.sectionIndex;
            sectionElapsedMs = p.sectionElapsedMs;
            totalElapsedMs = p.totalElapsedMs;
            priorSectionElapsed = p.sectionElapsedMs;
            priorTotalElapsed = p.totalElapsedMs;
            if (timerRunning) startedAtTimestamp = Date.now();
            render();
        });
        SupaClient.on('timer:prev', (p) => {
            sectionIndex = p.sectionIndex;
            sectionElapsedMs = p.sectionElapsedMs;
            totalElapsedMs = p.totalElapsedMs;
            priorSectionElapsed = p.sectionElapsedMs;
            priorTotalElapsed = p.totalElapsedMs;
            if (timerRunning) startedAtTimestamp = Date.now();
            render();
        });
        SupaClient.on('timer:config', (p) => {
            sections = p.sections;
            resetLocal();
        });

        SupaClient.onConnection((status) => {
            if (status === 'SUBSCRIBED') {
                tsDot.className = 'sd';
                tsStatus.textContent = 'Connected (Supabase Realtime)';
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                tsDot.className = 'sd disconnected';
                tsStatus.textContent = 'Disconnected';
            }
        });

        if (ok) {
            SupaClient.joinChannel(pid);
        }

        // Always set up localStorage listener too
        setupOfflineSync();
    }

    function setupOfflineSync() {
        if (!SupaClient.isConfigured()) {
            tsStatus.textContent = 'Connected (Local Network)';
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

        const configKey = `timer_active_config_${pid}`;
        const saved = localStorage.getItem(configKey);
        if (saved) {
            try { sections = JSON.parse(saved); render(); } catch (e) { /* ignore */ }
        }
    }

    render();
    setupRealtime();
})();
