# Agent IA WhatsApp : prendre le relais quand une action fixe échoue

Décision du 17/11/2026. Doc : `architecture/whatsapp-ai.md`.

Aujourd'hui, les boutons et « LIVRÉ <n°> <code> » sont traités par le code fixe
(`merchantOrders.service`, `onButton`) : en cas d'échec, une réponse fixe part
(« code incorrect », « commande inconnue »…) et l'IA n'est pas appelée.

[ ] Action fixe RÉUSSIE : rien ne change, l'IA ne fait rien (aucun appel au modèle).
[ ] Action fixe ÉCHOUÉE : l'IA est appelée avec l'action tentée et l'erreur, regarde la
    commande et explique ou aide. Exemples :
    - « LIVRÉ » au code faux : la commande a été annulée par le client, ou ce n'est pas
      ce numéro le livreur assigné (c'est Paul), ou elle est déjà livrée ;
    - commande inconnue : l'IA cherche la commande (n° mal recopié) ;
    - bouton sur une commande déjà traitée : l'IA dit où en est la commande.
    - seulement si l'IA est active (`ai_enabled`) et le numéro est celui d'une boutique
      WhatsApp ou d'un de ses livreurs ; sinon la réponse fixe actuelle reste.
    - la réponse fixe part-elle quand même, ou l'IA la remplace ? À décider.
