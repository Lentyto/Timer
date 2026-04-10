// ===== TIMER ENGINE (shared across all views) =====

const TimerEngine = (() => {
    const DEFAULT_SECTIONS = [
        { name: 'Introduction', minutes: 2, seconds: 0 },
        { name: 'Main Content', minutes: 1, seconds: 0 },
        { name: 'Conclusion', minutes: 0, seconds: 30 }
    ];

    function sectionDurationMs(sec) {
        return (sec.minutes * 60 + sec.seconds) * 1000;
    }

    function totalDurationMs(sections) {
        return sections.reduce((sum, s) => sum + sectionDurationMs(s), 0);
    }

    function formatTime(ms, showSign = false) {
        const negative = ms < 0;
        const absMs = Math.abs(ms);
        const totalSeconds = Math.floor(absMs / 1000);
        const centiseconds = Math.floor((absMs % 1000) / 10);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        let str;
        if (hours > 0) {
            str = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
        } else {
            str = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
        }
        if (negative && showSign) str = '-' + str;
        return str;
    }

    // Short format without centiseconds for compact displays
    function formatTimeShort(ms, showSign = false) {
        const negative = ms < 0;
        const absMs = Math.abs(ms);
        const totalSeconds = Math.floor(absMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        let str;
        if (hours > 0) {
            str = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            str = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        if (negative && showSign) str = '-' + str;
        return str;
    }

    /**
     * Given section duration and remaining ms, return a cue object
     * { color: 'blue'|'green'|'orange'|'red', label: string }
     */
    function getCue(durationMs, remainingMs) {
        if (remainingMs <= 0) {
            return { color: 'red', label: '⚠ STOP — TIME IS UP' };
        }
        const pct = remainingMs / durationMs;
        if (pct > 0.50) return { color: 'blue', label: '● PLENTY OF TIME' };
        if (pct > 0.25) return { color: 'green', label: '● SAFE TO CONCLUDE' };
        if (pct > 0.10) return { color: 'orange', label: '⚡ WRAP IT UP' };
        return { color: 'red', label: '🔴 STOP NOW' };
    }

    function elapsedBeforeSection(sections, sectionIndex) {
        let ms = 0;
        for (let i = 0; i < sectionIndex; i++) {
            ms += sectionDurationMs(sections[i]);
        }
        return ms;
    }

    /**
     * Compute full timer state from raw elapsed values
     */
    function computeState(sections, totalElapsedMs, sectionIndex, sectionElapsedMs) {
        const section = sections[sectionIndex] || sections[0];
        const secDuration = sectionDurationMs(section);

        // Calculate accumulated drift (time spent over the allocated budget for prior sections)
        const expectedElapsed = elapsedBeforeSection(sections, sectionIndex) + sectionElapsedMs;
        const drift = totalElapsedMs - expectedElapsed;

        // Subtract drift if we are overtime, but don't add time if we are early
        const sectionRemaining = secDuration - sectionElapsedMs - Math.max(0, drift);

        const totalTotal = totalDurationMs(sections);
        const totalRemaining = totalTotal - totalElapsedMs;

        const sectionCue = getCue(secDuration, sectionRemaining);
        const totalCue = getCue(totalTotal, totalRemaining);

        return {
            section,
            sectionIndex,
            sectionCount: sections.length,
            sectionElapsedMs,
            sectionRemaining,
            sectionDuration: secDuration,
            sectionCue,
            totalElapsedMs,
            totalRemaining,
            totalDuration: totalTotal,
            totalCue,
            sectionOvertime: sectionRemaining < 0,
            totalOvertime: totalRemaining < 0,
        };
    }

    return {
        DEFAULT_SECTIONS,
        sectionDurationMs,
        totalDurationMs,
        formatTime,
        formatTimeShort,
        getCue,
        elapsedBeforeSection,
        computeState,
    };
})();

if (typeof module !== 'undefined') module.exports = TimerEngine;
