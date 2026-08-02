// interface/supportFields.js
// Payloads du chat support (client <-> support yaammoo).

/** Objets de discussion acceptes (chips cote frontend). */
exports.SUPPORT_TOPICS = ['question', 'probleme', 'assistance', 'suggestion', 'discussion'];

/** Statuts d'un fil. */
exports.SUPPORT_STATUSES = ['open', 'pending', 'closed'];

/** POST /support/threads — creation d'un fil avec son premier message. */
exports.supportThreadFields = {
  userId: { type: 'string', required: true },
  topic: { type: 'string', required: true },
  // Absent ou null = demande adressee a la plateforme yaammoo.
  fastFoodId: { type: 'string', required: false, nullable: true },
  // Premier message du fil.
  text: { type: 'string', required: true },
  // Resume affiche sous le nom de l'interlocuteur ; deduit du texte si absent.
  title: { type: 'string', required: false },
};

/** POST /support/threads/:id/messages — message dans un fil existant. */
exports.supportMessageFields = {
  userId: { type: 'string', required: true },
  text: { type: 'string', required: true },
  // 'user' par defaut ; 'support' pour une reponse de l'equipe.
  author: { type: 'string', required: false },
};
