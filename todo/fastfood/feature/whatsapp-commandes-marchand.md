# Marchands par WhatsApp : nouvelle commande, acceptation, suivi, livraison, versement

Pour les marchands qui n'utilisent pas l'app : tout passe par le module WhatsApp
de rauval-backend (appli « Yaammoo », numéro virtuel +1 555-762-4938, compte de
messagerie « yaammoo »). Doc : `architecture/whatsapp.md` (« Flux marchands »).
Templates sur ce compte : `yam_nouvelle_commande`, `yam_nouvelles_commandes`,
`yam_rappel_commande`, `yam_demande_annulation`, `yam_statut_commande`,
`yam_commande_livree`, `yam_nouveau_message`, `yam_bienvenue_marchand`,
`yam_bonus` (client). Plusieurs sont reclassés marketing par Meta (payants), accepté.

La boutique est créée par l'admin comme pour un marchand normal (infos, numéro de
retrait Orange Money / MoMo compris). Le client paie toujours dans l'app : l'argent
est sur la plateforme avant que la commande parte.

[x] Boutique « par WhatsApp » : `PATCH /fastfood/:id/whatsapp-orders` (admin)
[x] Nouvelle commande payée → `yam_nouvelle_commande` (photo, n°, plats, livraison,
    montant vue marchand), un message par panier, boutons Accepter / Refuser
[x] Accepter → `processing` ; Refuser → `cancelByFastFood` (remboursement client)
[x] Suivi : récapitulatif + UN bouton (étape suivante), confirmation à chaque clic
[~] Livraison validée par QR code (décision du 15/11/2026) — backend fait (code, lien,
    `confirm-delivery`, « LIVRÉ » WhatsApp, versement automatique `orderPayout.service`) ;
    reste le QR dans l'app (branche frontend `feature/qr-livraison-whatsapp`) :
    - le QR ne paie rien, il prouve que la commande est arrivée chez le client
    - code secret par commande ; le QR de l'app client devient un lien wa.me vers
      le numéro Yaammoo, message prérempli « LIVRÉ <code> »
    - marchand SANS l'app : scan avec l'appareil photo → WhatsApp s'ouvre → il
      envoie → livraison validée (handler texte dans webhookEvents)
    - marchand AVEC l'app (ou livreur) : scan dans l'app → endpoint de validation
    - boutique normale : le scan valide seulement la livraison, aucune transaction
    - boutique WhatsApp : livraison validée → versement automatique de la part du
      marchand vers son numéro de retrait (service de retrait existant, mêmes frais),
      quel que soit le canal du scan (WhatsApp ou app)
    - app client : afficher le QR aussi sans livreur assigné (le marchand livre souvent)
    - relire `money-rules.md` et `wallet.md` avant ; aucun chiffre de mémoire
[x] Numéro de retrait d'une boutique WhatsApp : saisi par l'admin à la création
    (pas de code SMS, le marchand n'a pas l'app) : `PUT /fastfood/:id/payout-number`
[x] Fenêtre de 24 h fermée → template `yam_statut_commande` (suivi refusé 131047)
[x] Sans réponse au bout de N minutes → template `yam_rappel_commande`
    (`settings_app.whatsapp_reminder_minutes`, 10)
[x] Livraison validée depuis l'app → template `yam_commande_livree`
[x] Demande d'annulation → message libre + boutons, template `yam_demande_annulation`
    hors fenêtre (`merchantCancelRequests.service.js` ; variables du template à vérifier)
[ ] Message d'un client au marchand → template `yam_nouveau_message` (nom du
    client, sujet), sans le contenu ; bouton « Lire le message » (payload
    `<messageId>:read`) : le clic ouvre la fenêtre, le contenu part en message libre
