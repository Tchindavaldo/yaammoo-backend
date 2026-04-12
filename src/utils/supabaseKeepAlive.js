/**
 * Supabase Keep-Alive Service
 * This service pings Supabase periodically to prevent the project from pausing 
 * due to inactivity (Supabase pauses free projects after 1 week of no requests).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const pingSupabase = async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY missing. Keep-alive skipped.');
        return;
    }

    try {
        console.log(`[${new Date().toISOString()}] 📡 Pinging Supabase keep-alive...`);
        
        // Simple request to the REST API root
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            console.log('✅ Supabase is active.');
        } else {
            console.log(`⚠️ Supabase responded with status: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Failed to ping Supabase:', error.message);
    }
};

/**
 * Starts the keep-alive interval.
 * @param {number} intervalHours - How often to ping (default 72 hours / 3 days)
 */
const startKeepAlive = (intervalHours = 72) => {
    console.log(`🚀 Supabase keep-alive effectue son premier ping maintenant...`);
    pingSupabase();

    // Set interval
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setInterval(pingSupabase, intervalMs);
    
    console.log(`⏰ Prochain ping prévu dans ${intervalHours} heures.`);
};

module.exports = { startKeepAlive };
