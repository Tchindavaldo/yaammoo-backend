# Marchands par WhatsApp : nouvelle commande, acceptation, suivi des statuts

Pour les marchands qui n'utilisent pas l'app : tout passe par le module WhatsApp
de rauval-backend (appli « Yaammoo », numéro +237 698 087 460 en attendant le
numéro dédié). Réception déjà en place : `POST /whatsapp/webhook`
(`architecture/whatsapp.md`). Templates soumis à Meta le 15/11/2026, tous en
catégorie utilitaire, sans lien vers l'app : `yam_nouvelle_commande`,
`yam_nouvelles_commandes`, `yam_rappel_commande`, `yam_demande_annulation`,
`yam_statut_commande`, `yam_commande_livree`, `yam_nouveau_message`,
`yam_bienvenue_marchand`, `yam_bonus` (client : accès d'un bonus).

[ ] Boutique « par WhatsApp » : réglage par boutique, posé par l'admin (seules
    ces boutiques reçoivent les messages, au numéro `fastfoods.whatsapp_number`)
[ ] Nouvelle commande payée → template `yam_nouvelle_commande` : photo du plat,
    n°, plats (quantité, extras, boissons, sur une ligne), livraison, montant,
    boutons Accepter / Refuser (payload `<orderId>:accept` / `:refuse`)
    - panier de plusieurs plats (`groupId`) : un seul message pour le groupe
[ ] Accepter → `pending → processing` ; Refuser → `cancelByFastFood`
    (toujours via `updateOrders.service`, même machine à états)
[ ] Après acceptation : message libre (fenêtre de 24 h ouverte, donc gratuit)
    qui reprend n°, plat, livraison, montant, avec les boutons de suivi
    - statut par défaut : en attente ; le marchand met à jour avec les boutons
    - statuts : en attente, en cours, terminée, livraison en cours, livrée
    - ⚠️ un message à boutons en a 3 au plus : liste (10 lignes) ou seulement
      le statut suivant (la machine à états n'avance que d'un cran)
[ ] Chaque clic → transition, puis message libre de confirmation
    « Commande n°X (plat) : <statut> »
[ ] Fenêtre de 24 h fermée → template `yam_statut_commande`
[ ] Sans réponse au bout de N minutes → template `yam_rappel_commande`
    (délai dans `settings_app`)
[ ] Livraison terminée → template `yam_commande_livree`
[ ] Demande d'annulation → template `yam_demande_annulation`
    (voir `todo/user/feature/annulation-sur-demande.md`)
[ ] Message d'un client au marchand → template `yam_nouveau_message` (nom du
    client, sujet), sans le contenu : un template avec contenu libre est classé
    marketing par Meta, donc payant à chaque envoi
    - bouton « Lire le message » (payload `<messageId>:read`) : le clic ouvre la
      fenêtre de 24 h, le contenu part alors en message libre, gratuit
