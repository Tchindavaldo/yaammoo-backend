je reformile ma quesiotn en # Bonus — livraison offerte (armement & consommation)

> **Prérequis** : [bonus.md](./bonus.md) pour le modèle. Pour ce que « offerte »
> change à l'argent, lire [pricing.md](./pricing.md) : c'est la **course réelle**
> (`delivery.prix`) qui cesse d'être ajoutée au total. En régime `fastfood` elle
> n'est financée par rien d'autre — d'où le contrôle de finançabilité plus bas.

| Besoin                                            | Fichier                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| Modèle de données, routes                         | [bonus.md](./bonus.md)                               |
| Réclamation, code, solde                          | [bonus-lifecycle.md](./bonus-lifecycle.md)           |
| Composition du prix, campagne vs bonus            | [pricing.md](./pricing.md)                           |
| Qui renonce au montant (`covered_by`)             | [pricing-settlement.md](./pricing-settlement.md)     |
| Verdict serveur de gratuité au paiement           | [payment-amount-check.md](./payment-amount-check.md) |
| Ce que `quantity` désigne (exemplaires d'un plat) | [orders.md](./orders.md)                             |
| **Ce que la gratuité coûte, déplié cas par cas**  | [pricing-free-delivery-cost.md](./pricing-free-delivery-cost.md) |

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

> ⚠️ **L'armement ne vaut QUE pour les boutiques en régime `platform`.** Chez une
> boutique en régime `fastfood`, un bonus seulement armé est **ignoré** au
> paiement : le **code est obligatoire**. La raison est le minimum de plats — il
> dépend de la zone et du prix du plat, et seul `POST /bonus/verify` peut
> l'annoncer avant le paiement. Sans ce passage, le user découvrirait le refus au
> moment de payer.
>
> Le front doit donc, chez une boutique fastfood, faire saisir le code et le
> valider — l'armement depuis la page bonus n'y produit aucun effet. Le chemin
> d'armement reste en place côté backend (rien n'a été supprimé) : il redeviendra
> actif si la règle change.

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
  "minItems": 2, // plats minimum sur le DÉPART ; 0 = à calculer via /bonus/verify
}
```

**`minItems`** évite au front d'avoir à deviner le seuil :

| Régime     | Valeur | Pourquoi                                                       |
| ---------- | ------ | -------------------------------------------------------------- |
| `platform` | **2**  | seuil fixe, piloté en base (migration 041)                     |
| `fastfood` | **0**  | dépend de la zone et du prix : `POST /bonus/verify` le calcule |

Deux réglages **distincts**, pour durcir l'un sans toucher à l'autre :

| Clé                                         | Défaut | Portée                       |
| ------------------------------------------- | -----: | ---------------------------- |
| `platform_free_delivery_min_items_bonus`    |      2 | bonus nominatif              |
| `platform_free_delivery_min_items_campaign` |      2 | campagne `delivery_free_mode` |

Repli applicatif à **1** si la clé est illisible — jamais 0 : une lecture ratée
ne doit pas refuser un paiement par excès de zèle.

C'est indispensable pour la **campagne globale**, qui ne passe jamais par
`/bonus/verify` : sans ce champ, le front n'aurait aucun moyen d'annoncer le
minimum avant le paiement.

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

## La gratuité doit rester finançable

`services/bonus/deliveryOfferAffordability.js`

Offrir la livraison ne coûtait rien tant que la zone la PLUS CHÈRE était fondue
dans le prix du plat : la marge (zone + 100) couvrait n'importe quelle course.
Depuis la migration 038, le régime `fastfood` ne fond plus aucune zone et la
marge vaut 200 — **au-delà d'environ 320 F de course offerte, la plateforme verse
au marchand plus qu'elle n'a encaissé**.

Ce qui finance une course offerte, **par exemplaire commandé** :

```
contribution = (marge du palier + surplus d'arrondi) × (1 − commission)
qty minimale = plafond( course / contribution )
```

Marge et surplus sont facturés sur **chaque** exemplaire, la course reste unique :
commander plus de plats rend l'offre finançable.

| Brut | Contribution / plat | Course 250 | Course 500 | Course 1000 | Course 1400 |
| ---- | ------------------- | ---------- | ---------- | ----------- | ----------- |
| 1000 | 361                 | 1 plat     | 2 plats    | 3 plats     | 4 plats     |
| 2000 | 311                 | 1 plat     | 2 plats    | 4 plats     | 5 plats     |
| 3000 | 260                 | 1 plat     | 2 plats    | 4 plats     | 6 plats     |
| 3500 | **706**             | 1 plat     | 1 plat     | 2 plats     | 2 plats     |
| 5000 | 617                 | 1 plat     | 1 plat     | 2 plats     | 3 plats     |

> ⚠️ La contribution **ne suit pas** la hauteur du prix : 3500 (706) finance deux
> fois mieux que 3000 (260). Elle dépend de la marge du palier ET de la position
> du prix juste dans le pas de 500. Voir
> [pricing-margin-risk.md](./pricing-margin-risk.md).

### Refus DUR

En dessous du minimum, le bonus est **refusé**, pas absorbé — `validatePaymentAmount`
rejette la commande **avant tout encaissement** (`POST /transaction` → 400).

Pour que le user ne le découvre pas au paiement, **`POST /bonus/verify` accepte un
contexte de commande facultatif** et annonce la règle à l'avance :

```jsonc
POST /bonus/verify
{ "code": "ABC123", "fastFoodId": "ff_42",
  // quantity = total de plats du DÉPART, pas d'une commande isolée
  "order": { "brutUnit": 2000, "quantity": 1, "coursePrice": 500 } }

→ { "valid": false, "reason": "not_affordable",
    "minItems": 2, "missingItems": 1,
    "message": "Ajoutez 1 plat pour bénéficier de la livraison offerte (2 plats minimum pour cette zone)." }
```

En régime `platform`, le message ne mentionne pas la zone — le seuil y est fixe :

```
"Ajoutez 1 plat pour bénéficier de la livraison offerte (2 plats minimum)."
```

`order` omis → contrôle sauté, la vérification hors contexte reste possible.

### Quand la règle ne s'applique PAS

| Cas                      | Pourquoi                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `coveredBy = 'fastfood'` | le **marchand** renonce à sa course, la plateforme ne finance rien |

> ⚠️ **La campagne globale n'est PLUS exemptée.** Elle passait sans aucun
> contrôle : sur un départ d'un seul plat, le livreur était rogné exactement
> comme avec un bonus. Elle applique désormais le même minimum, et le refus est
> identique.

> ⚠️ En régime `platform`, le minimum n'est pas supprimé : il vaut **2 plats,
> fixe**. Ce n'est pas la marge qu'il protège (elle n'est jamais menacée ici)
> mais le **livreur** — à un seul plat il absorbe une partie de sa course,
> jusqu'à `driver_amortization_max`. Dès deux plats il touche son tarif entier.
> Fixe et non calculé : l'absorption dépend de la position du prix juste dans le
> pas d'arrondi, un seuil variable serait inexplicable au user.

> ⚠️ **La campagne globale ne s'applique PLUS en régime `fastfood`.** Elle
> contournait le contrôle de finançabilité — aucun minimum de plats — alors que
> la course y est facturée à part : une campagne pouvait produire des marges
> négatives en série. En fastfood, la gratuité passe désormais par un **bonus à
> code** uniquement.

### Le minimum se mesure sur le DÉPART, pas sur une commande

Une commande = **un plat** et ses options ; `quantity` en est le nombre
d'exemplaires (cf. [orders.md](./orders.md)). Un panier de 3 plats différents
fait donc 3 commandes — mais **une seule course** si elles partent ensemble.

Le minimum porte donc sur le total de plats du **départ**, identifié par
`deliveryGroupKey` (`fastFoodId | zone | type | date (+ heure)`) :

```
panier : 2 commandes × 1 plat, même boutique, même zone, même créneau
       → 1 seul départ, 2 plats  → minimum de 2 ATTEINT
```

C'est exactement équivalent à une commande de 2 plats — même argent encaissé,
même course unique à financer :

| Panier                | Livreur touche | Il absorbe | Marge plateforme |
| --------------------- | -------------- | ---------- | ---------------- |
| 1 commande × 1 plat   | 246 / 250      | 4          | 100              |
| **2 commandes × 1 plat** | **250 / 250** | **0**   | **496**          |
| 1 commande × 2 plats  | 250 / 250      | 0          | 496              |

> ⚠️ Deux commandes de **zones différentes** ne partagent pas de départ : ce sont
> deux courses, chacune doit atteindre le minimum par elle-même.

> ⚠️ **Le front doit passer le cumul du départ** dans `order.quantity` à
> `POST /bonus/verify`, pas la quantité d'une commande isolée — sinon il annonce
> un refus qui n'aura pas lieu au paiement.
