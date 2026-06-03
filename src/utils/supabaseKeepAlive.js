/**
 * Supabase Keep-Alive Service (multi-projets)
 *
 * Ping périodiquement PLUSIEURS projets Supabase depuis CE backend, pour éviter
 * qu'ils passent en pause (Supabase met en pause les projets gratuits après ~1
 * semaine sans requête). Un seul backend garde ainsi vivants tous les projets.
 *
 * Cibles découvertes depuis les variables d'environnement :
 *   - PRIMARY : SUPABASE_URL        + SUPABASE_KEY (ou SUPABASE_SERVICE_ROLE_KEY)
 *   - LEGACY  : LEGACY_SUPABASE_URL + LEGACY_SUPABASE_KEY
 *   - <NOM>   : KEEPALIVE_<NOM>_SUPABASE_URL + KEEPALIVE_<NOM>_SUPABASE_KEY
 *              (ajouter un projet = ajouter ces 2 vars, sans recoder)
 *
 * Chaque ping est ISOLÉ : un projet en pause/erreur n'empêche pas les autres.
 */

/**
 * Construit la liste des cibles { name, url, key } depuis l'environnement.
 * Ignore une cible dont l'URL ou la clé manque, et déduplique par URL.
 */
const resolveTargets = () => {
    const targets = [];
    const seen = new Set();

    const add = (name, url, key) => {
        if (!url || !key) return;
        if (seen.has(url)) return; // évite de pinger 2x le même projet
        seen.add(url);
        targets.push({ name, url, key });
    };

    // PRIMARY (projet principal du backend).
    add(
        'PRIMARY',
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // LEGACY (ancien projet conservé).
    add('LEGACY', process.env.LEGACY_SUPABASE_URL, process.env.LEGACY_SUPABASE_KEY);

    // Projets additionnels : KEEPALIVE_<NOM>_SUPABASE_URL/KEY.
    for (const envKey of Object.keys(process.env)) {
        const m = envKey.match(/^KEEPALIVE_(.+)_SUPABASE_URL$/);
        if (!m) continue;
        const name = m[1];
        add(name, process.env[envKey], process.env[`KEEPALIVE_${name}_SUPABASE_KEY`]);
    }

    return targets;
};

/**
 * Ping un projet Supabase (REST root). Best-effort, ne jette jamais.
 */
const pingOne = async ({ name, url, key }) => {
    try {
        const response = await fetch(`${url}/rest/v1/`, {
            method: 'GET',
            headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (response.ok) {
            console.log(`✅ [keep-alive] ${name} actif (${response.status}).`);
        } else {
            console.log(`⚠️ [keep-alive] ${name} a répondu ${response.status}.`);
        }
    } catch (error) {
        console.error(`❌ [keep-alive] ${name} injoignable : ${error.message}`);
    }
};

/**
 * Ping toutes les cibles (en parallèle, chacune isolée).
 */
const pingAll = async () => {
    const targets = resolveTargets();
    if (targets.length === 0) {
        console.warn('⚠️ [keep-alive] Aucune cible Supabase configurée — ping ignoré.');
        return;
    }
    console.log(
        `[${new Date().toISOString()}] 📡 Keep-alive sur ${targets.length} projet(s) : ` +
        targets.map((t) => t.name).join(', ')
    );
    await Promise.all(targets.map(pingOne));
};

/**
 * Démarre l'intervalle de keep-alive (ping immédiat puis périodique).
 * @param {number} intervalHours - Fréquence en heures (défaut 72h / 3 jours).
 */
const startKeepAlive = (intervalHours = 72) => {
    console.log('🚀 Supabase keep-alive : premier ping maintenant…');
    pingAll();

    const intervalMs = intervalHours * 60 * 60 * 1000;
    setInterval(pingAll, intervalMs);

    console.log(`⏰ Prochain ping dans ${intervalHours} heures.`);
};

module.exports = { startKeepAlive, resolveTargets, pingAll };
