# Annulation sur demande : le client demande, le marchand décide

**Gravité : ÉLEVÉE — à régler rapidement.**

**Fait le 16/11/2026** (branche `feature/whatsapp-ai`) pour les **boutiques WhatsApp** :
`services/order/cancelRequest.service.js`, `architecture/order-cancel.md`
(« Annulation sur demande »). Boutique normale : annulation directe tant que `pending`,
avec verrou de concurrence.

Avant : `cancelByUser` passait tel quel depuis le client
(`services/order/updateOrders.service.js`). Les marchands qui travaillent par
WhatsApp (module WhatsApp de rauval-backend) ne peuvent pas suivre une
annulation imposée : l'annulation devient une **demande** que le marchand
accepte ou refuse. Pendant de la tâche frontend
`yaammoo-frontend/todo/user/feature/annulation-sur-demande.md`.

[x] Machine à états (boutique WhatsApp) : le client ne passe plus directement à `cancelByUser`
    - `pending` → demande d'annulation (`order.cancelRequest`, pas de nouveau statut : R11)
    - `processing` et au-delà → refus `400` « Le restaurant a déjà accepté cette commande… » (existant)
[x] Décision du marchand : accepter → `cancelByUser` ; refuser → retour au statut précédent
[x] Notifications : demande → marchand (push + socket, et WhatsApp pour les
    marchands sans app : template `yam_demande_annulation`, boutons Accepter / Refuser) ;
    décision → client (push + socket)
[x] Réception des réponses WhatsApp : le module relaie le bouton cliqué
    (`button.id`) vers l'URL de relais de Yaammoo
[x] Versioning R11 : `cancel_request_min_app_version` (1.1.5) ; en dessous, 409 avec le message
[x] Remboursement à l'acceptation : règle client inchangée (`money-rules.md`, R22)
[x] Délai sans réponse du marchand : aucun, la demande reste en attente (décision du 16/11/2026)
