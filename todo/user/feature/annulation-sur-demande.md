# Annulation sur demande : le client demande, le marchand décide

**Gravité : ÉLEVÉE — à régler rapidement.**

Aujourd'hui `cancelByUser` passe tel quel depuis le client
(`services/order/updateOrders.service.js`). Les marchands qui travaillent par
WhatsApp (module WhatsApp de rauval-backend) ne peuvent pas suivre une
annulation imposée : l'annulation devient une **demande** que le marchand
accepte ou refuse. Pendant de la tâche frontend
`yaammoo-frontend/todo/user/feature/annulation-sur-demande.md`.

[ ] Machine à états : le client ne passe plus directement à `cancelByUser`
    - `pending` → demande d'annulation (nouveau statut, ex. `cancelRequested`)
    - `processing` et au-delà → refus `409` « commande déjà commencée »
[ ] Décision du marchand : accepter → `cancelByUser` ; refuser → retour au statut précédent
[ ] Notifications : demande → marchand (push + socket, et WhatsApp pour les
    marchands sans app : template `yam_demande_annulation`, boutons Accepter / Refuser) ;
    décision → client (push + socket)
[ ] Réception des réponses WhatsApp : le module relaie le bouton cliqué
    (`button.id`) vers l'URL de relais de Yaammoo
[ ] Versioning R11 : les apps déjà publiées ne connaissent pas le nouveau statut
[ ] Remboursement à l'acceptation : `money-rules.md` (R22)
[ ] Délai sans réponse du marchand : à décider
