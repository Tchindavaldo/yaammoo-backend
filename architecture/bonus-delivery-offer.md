# Bonus — livraison offerte (armement & consommation)

> **Prérequis** : [bonus.md](./bonus.md) pour le modèle. Pour comprendre ce que
> « offerte » change à l'argent, lire [pricing.md](./pricing.md) — la **zone max**
> reste fondue dans le prix du plat, c'est la **course réelle** qui n'est plus
> ajoutée au total.

| Besoin                                  | Fichier                                              |
| --------------------------------------- | ---------------------------------------------------- |
| Modèle de données, routes               | [bonus.md](./bonus.md)                               |
| Réclamation, code, solde                | [bonus-lifecycle.md](./bonus-lifecycle.md)           |
| Composition du prix, campagne vs bonus  | [pricing.md](./pricing.md)                           |
| Qui renonce au montant (`covered_by`)   | [pricing-settlement.md](./pricing-settlement.md)     |
| Verdict serveur de gratuité au paiement | [payment-amount-check.md](./payment-amount-check.md) |

## Livraison offerte : armement & consommation

Bonus de `type: "free_delivery"`. Deux notions **distinctes** :

|                  | Quoi                                                            | Persisté ?        | Consomme ? |
| ---------------- | --------------------------------------------------------------- | ----------------- | ---------- |
| **Réclamation**  | `POST /bonus/:id/claim` — décrémente le solde, délivre un code  | oui               | non        |
| **Armement**     | le user déclare que le bonus s'applique à sa prochaine commande | _selon l'origine_ | **non**    |
| **Consommation** | `usageCount++`                                                  | oui               | **oui**    |

### Deux origines d'armement

- **Page bonus → armement GLOBAL, persisté.** `POST /bonus/:id/arm` écrit
  `armed = true` (colonne, migration 018). Il doit survivre à la fermeture de
  l'app : au retour, `GET /fastfood/all` renvoie `deliveryOffer` sur les
  boutiques concernées. `DELETE /bonus/:id/arm` désarme — toujours autorisé,
  même sur un bonus expiré, sinon il resterait armé indéfiniment.
- **Écran de commande → armement LOCAL, non persisté.** Le front arme tout seul ;
  il valide juste le code via `POST /bonus/verify` (lecture seule) pour son
  rendu, puis envoie `bonusCode` (string à la racine) dans `POST /order`.

**Exclusivité** : armer un bonus désarme automatiquement tout autre bonus armé
qui le **recouvre** (même boutique, ou l'un des deux plateforme) — sinon l'offre
applicable serait ambiguë. Les bonus désarmés sont renvoyés dans
`data.disarmedBonusIds`.

**Sockets `bonus.armed` / `bonus.disarmed`** (room `<userId>`) : deux events
distincts, émis respectivement par `POST` et `DELETE /bonus/:id/arm`, avec
exactement le même payload que la réponse HTTP
(`{bonusId, armed, disarmedBonusIds, deliveryOffer}`). Sur `bonus.disarmed`,
`deliveryOffer` vaut `null` et `disarmedBonusIds` est toujours vide (l'exclusivité
ne joue qu'à l'armement). L'appareil qui a appelé la route est déjà à jour par la
réponse ; les events existent pour les **autres appareils** du user, qui
garderaient sinon un état d'armement périmé. Émission non bloquante : un socket
indisponible ne fait jamais échouer l'armement.

Émis via **`reliableEmit`** (persisté dans `outbox_events`, rejoué au prochain
`join_user`) : un appareil hors ligne au moment de l'armement doit retrouver
l'état au retour, sinon il continuerait de proposer une livraison offerte déjà
désarmée ailleurs. Le payload rejoué porte `__eventId` et `__replay: true` — le
front **doit ACK** (callback socket.io) pour que l'event cesse d'être rejoué, et
peut dédoublonner sur `__eventId`.

### Consommation — uniquement à `POST /order`

`applyDeliveryBonus.service` découpe en deux temps :

1. **`resolveDeliveryBonus`, AVANT création** — un `bonusCode` fourni mais
   invalide fait échouer la commande en 400 (le user croit bénéficier de la
   gratuité, l'ignorer silencieusement serait trompeur). Sans `bonusCode`, on
   retombe sur l'armement global ; son absence est normale, pas une erreur.
2. **`consumeDeliveryBonus`, APRÈS création réussie** — `usageCount++`,
   `redeemed` si limite atteinte, et **`armed = !redeemed`** : le bonus reste
   armé tant qu'il reste des utilisations. Il n'est désarmé automatiquement qu'à
   épuisement ; sinon c'est au user de le désarmer depuis le front.

> C'est tout l'intérêt du découpage : **pas de commande = pas de consommation**.
> Le user peut quitter l'écran de commande sans rien perdre.

### `deliveryOffer` — objet unique partagé

Même forme partout (`GET /fastfood/all`, `POST /bonus/verify`, `POST /bonus/:id/arm`,
commande créée). Il porte des **données**, jamais une consigne d'affichage :

```jsonc
{
  "active": true,
  "reason": "bonus", // "campaign" = mode gratuité globale plateforme
  "coveredBy": "fastfood", // qui renonce au montant : "fastfood" | "platform"
  "bonusId": "b_12",
  "bonusCode": "YAM-7K3F9QW2",
  "bonusName": "Livraison offerte",
  "fastFoodId": "ff_42", // null = bonus plateforme, valable partout
}
```

`null` quand aucune offre ne s'applique — ou, sur `/fastfood/all`, quand
l'appelant n'est pas authentifié.

> ⚠️ **Les montants de livraison ne sont JAMAIS forcés à 0.** `delivery.prix`
> reste au prix réel ; `deliveryOffer` dit seulement que la livraison est
> offerte, et le front décide du rendu (prix barré, libellé…).

**Portée** : un bonus de boutique ne vaut que chez elle ; un bonus plateforme
(`fastFoodId: null`) vaut partout. Un bonus de boutique prime sur un bonus
plateforme quand les deux s'appliquent.

**Propriété du code non vérifiée** : `/bonus/verify` et `POST /order` acceptent
un code qui n'appartient pas à l'appelant — un code peut circuler entre users. Le
code fait foi.

### `GET /fastfood/all` — auth facultative

La route est **publique**, mais `deliveryOffer` dépend du user. D'où
`optionalFirebaseAuth` : token valide → `req.user` renseigné ; token absent **ou
invalide** → on sert quand même la route, sans `deliveryOffer`. Les bonus armés
sont lus **une seule fois** pour toute la liste (`getArmedByUser`, index partiel
migration 018) — pas de N+1.

---
