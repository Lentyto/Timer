// ===== SUPABASE CLIENT & REALTIME HELPERS =====

const SupaClient = (() => {
    // ========== CONFIGURE THESE ==========
    const SUPABASE_URL = '{{SUPABASE_URL}}';
    const SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';
    // ======================================

    let client = null;
    let channel = null;
    let currentPid = null;
    let dbAvailable = false;

    // Pending listener registrations (before channel is subscribed)
    const pendingListeners = [];
    const connectionListeners = [];

    function isConfigured() {
        return SUPABASE_URL !== 'https://YOUR_PROJECT.supabase.co' && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY';
    }

    function init() {
        if (!isConfigured()) {
            console.warn('[SupaClient] Supabase not configured — running in offline/local mode');
            return false;
        }
        if (!window.supabase) {
            console.error('[SupaClient] Supabase JS not loaded');
            return false;
        }
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[SupaClient] Initialized');
        return true;
    }

    /**
     * Register a broadcast event listener.
     * MUST be called BEFORE joinChannel().
     * Listeners are queued and attached to the channel before subscribe().
     */
    function on(event, callback) {
        pendingListeners.push({ event, callback });
    }

    function onConnection(callback) {
        connectionListeners.push(callback);
    }

    /**
     * Create and subscribe to the realtime broadcast channel.
     * All on() listeners registered before this call will be attached.
     */
    function joinChannel(pid) {
        if (!client) return null;
        currentPid = pid;

        channel = client.channel(`timer-${pid}`, {
            config: { broadcast: { self: false } }
        });

        // Attach ALL pending listeners BEFORE subscribing
        for (const { event, callback } of pendingListeners) {
            channel.on('broadcast', { event }, (msg) => {
                callback(msg.payload);
            });
        }

        // Now subscribe
        channel.subscribe((status) => {
            console.log(`[SupaClient] Channel status: ${status}`);
            connectionListeners.forEach(cb => cb(status));
        });

        return channel;
    }

    function broadcast(event, payload) {
        if (!channel) {
            // Offline mode — only localStorage cross-tab will carry this
            return;
        }
        channel.send({
            type: 'broadcast',
            event,
            payload
        });
    }

    // ===== Database CRUD for timer configs =====
    // Always falls back to localStorage if DB is unavailable

    function _lsKey(pid) { return `timer_configs_${pid}`; }

    function _lsLoad(pid) {
        return JSON.parse(localStorage.getItem(_lsKey(pid)) || '[]');
    }

    function _lsSave(pid, configs) {
        localStorage.setItem(_lsKey(pid), JSON.stringify(configs));
    }

    async function saveConfig(pid, name, sections, isDefault = true) {
        // Always save to localStorage as backup
        const configs = _lsLoad(pid);
        const existing = configs.findIndex(c => c.name === name);
        const entry = {
            id: existing >= 0 ? configs[existing].id : crypto.randomUUID(),
            pid, name, sections, is_default: isDefault,
            created_at: existing >= 0 ? configs[existing].created_at : new Date().toISOString()
        };
        if (existing >= 0) configs[existing] = entry;
        else configs.push(entry);
        _lsSave(pid, configs);

        // Try DB if available
        if (client && dbAvailable) {
            try {
                if (isDefault) {
                    await client.from('timer_configs').update({ is_default: false }).eq('pid', pid);
                }
                await client.from('timer_configs')
                    .upsert({ pid, name, sections, is_default: isDefault }, { onConflict: 'pid,name' });
            } catch (e) {
                console.warn('[SupaClient] saveConfig DB error (using localStorage):', e);
            }
        }
        return entry;
    }

    async function loadConfigs(pid) {
        // Try DB first
        if (client && dbAvailable) {
            try {
                const { data, error } = await client
                    .from('timer_configs')
                    .select('*')
                    .eq('pid', pid)
                    .order('created_at', { ascending: false });
                if (!error && data) return data;
            } catch (e) {
                console.warn('[SupaClient] loadConfigs DB error (using localStorage):', e);
            }
        }
        // Fallback to localStorage
        return _lsLoad(pid);
    }

    async function deleteConfig(id) {
        // Remove from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('timer_configs_')) {
                const configs = JSON.parse(localStorage.getItem(key) || '[]');
                const filtered = configs.filter(c => c.id !== id);
                if (filtered.length !== configs.length) {
                    localStorage.setItem(key, JSON.stringify(filtered));
                    break;
                }
            }
        }

        // Try DB
        if (client && dbAvailable) {
            try {
                await client.from('timer_configs').delete().eq('id', id);
            } catch (e) { /* ignore */ }
        }
        return true;
    }

    /**
     * Check if the timer_configs table exists and is accessible.
     */
    async function checkDbAvailability() {
        if (!client) return;
        try {
            const { error } = await client.from('timer_configs').select('id').limit(1);
            if (!error) {
                dbAvailable = true;
                console.log('[SupaClient] Database table available');
            } else {
                dbAvailable = false;
                console.warn('[SupaClient] Database table not available (using localStorage):', error.message);
            }
        } catch (e) {
            dbAvailable = false;
        }
    }

    function getPid() { return currentPid || sessionStorage.getItem('pid'); }
    function getMode() { return sessionStorage.getItem('mode'); }

    return {
        isConfigured,
        init,
        joinChannel,
        broadcast,
        on,
        onConnection,
        checkDbAvailability,
        saveConfig,
        loadConfigs,
        deleteConfig,
        getPid,
        getMode,
    };
})();
