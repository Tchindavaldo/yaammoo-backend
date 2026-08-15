// ============================================================================
// banners.controller — CRUD bannières publicitaires + lecture home
// ============================================================================
// Lecture `GET /banner` = publique (le home l'utilise). Tout le CRUD écriture
// est réservé aux administrateurs.
//
// `POST /banner` accepte du `multipart/form-data` : l'image est uploadée en
// Supabase une seule fois à la création (champ `image`, multer), et le lien
// obtenu est stocké dans `image_url`. On peut aussi passer une `imageUrl`
// directement en JSON (déjà hébergée) si besoin.
// ============================================================================
const { uploadImageToSupabase } = require('../../services/images/uploadImage.service');
const {
  getActiveBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} = require('../../services/banners/banners.service');

const VALID_TYPES = ['bonus', 'none'];

// En multipart, multer livre les champs en STRING ("true", "3", "bonus"…).
// On normalise pour accepter à la fois le JSON pur et le form-data.
function parseBannerBody(req, { partial = false } = {}) {
  const body = req.body || {};
  const out = {};

  const has = k => body[k] !== undefined && body[k] !== null;

  if (has('title')) out.title = typeof body.title === 'string' ? body.title : null;

  if (has('type')) {
    if (!VALID_TYPES.includes(body.type)) {
      const err = new Error(`Champ \`type\` invalide : doit être ${VALID_TYPES.join(' ou ')}.`);
      err.status = 400;
      throw err;
    }
    out.type = body.type;
  }

  if (has('targetId')) out.targetId = String(body.targetId);

  if (has('active')) {
    const v = String(body.active).toLowerCase();
    out.active = v === 'true' || v === '1';
  }

  if (has('sortOrder')) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n)) {
      const err = new Error('Champ `sortOrder` doit être un entier.');
      err.status = 400;
      throw err;
    }
    out.sortOrder = n;
  }

  // `imageUrl` directe (JSON) : optionnelle en création, le fichier primant.
  const type = out.type !== undefined ? out.type : (has('type') ? body.type : undefined);
  if (type === 'bonus') {
    if (!out.targetId) {
      const err = new Error('Un banner de type `bonus` doit fournir `targetId` (id du bonus).');
      err.status = 400;
      throw err;
    }
  } else if (type === 'none') {
    out.targetId = null;
  }

  return out;
}

async function resolveImageUrl(req) {
  if (req.file) {
    return uploadImageToSupabase(req.file);
  }
  if (req.body?.imageUrl && typeof req.body.imageUrl === 'string' && req.body.imageUrl.trim()) {
    return req.body.imageUrl.trim();
  }
  const err = new Error('Champ `image` (fichier) ou `imageUrl` requis.');
  err.status = 400;
  throw err;
}

/** GET /banner — publics : bannières actives pour le home. */
exports.getActiveBannersController = async (req, res) => {
  try {
    const data = await getActiveBanners();
    return res.status(200).json({ success: true, message: 'Bannières actives.', data });
  } catch (error) {
    console.error('Erreur lecture bannières :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** GET /banner/all — admin : toutes les bannières (y compris inactives). */
exports.getAllBannersController = async (req, res) => {
  try {
    const data = await getAllBanners();
    return res.status(200).json({ success: true, message: 'Bannières récupérées.', data });
  } catch (error) {
    console.error('Erreur lecture bannières :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** POST /banner — admin : crée une bannière (upload + insertion en un appel). */
exports.createBannerController = async (req, res) => {
  try {
    const fields = parseBannerBody(req);
    const imageUrl = await resolveImageUrl(req);
    const { sortOrder } = { ...fields };
    delete fields.sortOrder;
    const data = await createBanner({ ...fields, imageUrl }, sortOrder);
    return res.status(201).json({ success: true, message: 'Bannière créée.', data });
  } catch (error) {
    const status = error.status || 500;
    console.error('Erreur création bannière :', error.message);
    return res.status(status).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** PATCH /banner/:id — admin : modifie / déplace une bannière. */
exports.updateBannerController = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = parseBannerBody(req, { partial: true });
    // Si une nouvelle image est fournie (form-data), on l'uploade et on remplace.
    if (req.file) {
      fields.imageUrl = await uploadImageToSupabase(req.file);
    } else if (req.body?.imageUrl && typeof req.body.imageUrl === 'string' && req.body.imageUrl.trim()) {
      fields.imageUrl = req.body.imageUrl.trim();
    }
    const { sortOrder } = { ...fields };
    delete fields.sortOrder;
    const data = await updateBanner(id, fields, sortOrder);
    return res.status(200).json({ success: true, message: 'Bannière mise à jour.', data });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

/** DELETE /banner/:id — admin : supprime une bannière. */
exports.deleteBannerController = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteBanner(id);
    return res.status(200).json({ success: true, message: 'Bannière supprimée.' });
  } catch (error) {
    console.error('Erreur suppression bannière :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
