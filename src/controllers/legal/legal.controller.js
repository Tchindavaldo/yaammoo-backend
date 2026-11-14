const repos = require('../../repositories');

/**
 * Statut d'acceptation : `mustAccept` si l'utilisateur n'a jamais accepté, ou
 * si une version exigeant une nouvelle acceptation est plus récente que la
 * sienne. Une version mineure ne redemande rien (signalée par l'app).
 */
async function statusOf(userId) {
  const [latest, required, last] = await Promise.all([repos.legal.getLatest(), repos.legal.getLatestRequiredVersion(), repos.legal.getLastAcceptance(userId)]);
  const mustAccept = !!latest && (!last || (required != null && last.version < required));
  return { latestVersion: latest?.version ?? null, publishedAt: latest?.publishedAt ?? null, acceptedVersion: last?.version ?? null, acceptedAt: last?.acceptedAt ?? null, mustAccept };
}

/** GET /legal/current — texte de la dernière version (public). */
exports.getCurrentLegal = async (_req, res) => {
  try {
    const doc = await repos.legal.getLatest();
    if (!doc) return res.status(404).json({ success: false, message: 'Aucun texte publié.' });
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('[legal] current', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

/** GET /legal/status — statut d'acceptation de l'utilisateur authentifié. */
exports.getLegalStatus = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, message: 'Non authentifié' });
    return res.status(200).json({ success: true, data: await statusOf(userId) });
  } catch (error) {
    console.error('[legal] status', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};

/** POST /legal/accept { version } — enregistre l'acceptation (preuve). */
exports.acceptLegal = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, message: 'Non authentifié' });
    const version = Number(req.body?.version);
    const latest = await repos.legal.getLatest();
    if (!latest || version !== latest.version) return res.status(409).json({ success: false, code: 'legal_outdated', message: 'Une nouvelle version des conditions est disponible.' });
    await repos.legal.accept({ userId, version, appVersion: req.headers['x-app-version'] });
    return res.status(200).json({ success: true, data: await statusOf(userId) });
  } catch (error) {
    console.error('[legal] accept', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};
