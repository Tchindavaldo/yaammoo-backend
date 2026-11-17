const repos = require('../../repositories');

/**
 * Statut d'acceptation : `mustAccept` si l'utilisateur n'a jamais accepté, ou
 * si une version exigeant une nouvelle acceptation est plus récente que la
 * sienne. Une version mineure ne redemande rien (signalée par l'app).
 */
async function statusOf(userId) {
  const [latest, required, last, user] = await Promise.all([repos.legal.getLatest(), repos.legal.getLatestRequiredVersion(), repos.legal.getLastAcceptance(userId), repos.users.getUserByIdSafe(userId)]);
  const mustAccept = !!latest && (!last || (required != null && last.version < required));
  // Boutique sans formulaire d'adhesion (Annexe 3) : l'app affiche le bottom sheet obligatoire.
  const shopId = user?.fastFoodId || null;
  const merchantAdhesionPending = shopId && !(await repos.legal.hasMerchantAdhesion(shopId)) ? shopId : null;
  return { latestVersion: latest?.version ?? null, publishedAt: latest?.publishedAt ?? null, acceptedVersion: last?.version ?? null, acceptedAt: last?.acceptedAt ?? null, mustAccept, merchantAdhesionPending };
}

/** Adresse de l'Annexe 3 : celle envoyee, sinon la position GPS de la boutique, sinon ses villes. */
function shopAddress(shop, sent) {
  const given = String(sent || '').trim();
  if (given) return given;
  if (shop.latitude != null && shop.longitude != null) return `GPS ${shop.latitude}, ${shop.longitude}`;
  return (shop.cities || []).join(', ') || '-';
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

/**
 * POST /legal/merchant-adhesion { fastFoodId, version, representativeRole (texte libre), legalName?, address? }
 * Adresse absente : position GPS de la boutique, sinon ses villes.
 * Annexe 3 : nom et prénom lus sur le compte, nom de la boutique lu en base,
 * date et heure posées par la base. Vaut aussi acceptation des CGU.
 */
exports.saveMerchantAdhesion = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ success: false, message: 'Non authentifié' });
    const { fastFoodId, legalName } = req.body || {};
    const version = Number(req.body?.version);
    const representativeRole = String(req.body?.representativeRole || '')
      .trim()
      .slice(0, 60);
    if (!fastFoodId || !representativeRole) return res.status(400).json({ success: false, message: 'Qualité du représentant obligatoire.' });
    const latest = await repos.legal.getLatest();
    if (!latest || version !== latest.version) return res.status(409).json({ success: false, code: 'legal_outdated', message: 'Une nouvelle version des conditions est disponible.' });
    const shop = await repos.fastfoods.getById(fastFoodId);
    if (!shop || shop.userId !== userId) return res.status(403).json({ success: false, message: 'Boutique introuvable pour ce compte.' });
    const address = shopAddress(shop, req.body?.address);
    const user = await repos.users.getUserByIdSafe(userId);
    const representativeName = [user?.infos?.nom, user?.infos?.prenom].filter(Boolean).join(' ').trim() || '-';
    const appVersion = req.headers['x-app-version'];
    await repos.legal.saveMerchantAdhesion({ fastFoodId, userId, version, representativeName, representativeRole, shopName: shop.name, legalName: String(legalName || '').trim(), address, appVersion });
    await repos.legal.accept({ userId, version, appVersion });
    return res.status(200).json({ success: true, data: await statusOf(userId) });
  } catch (error) {
    console.error('[legal] merchant-adhesion', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
  }
};
