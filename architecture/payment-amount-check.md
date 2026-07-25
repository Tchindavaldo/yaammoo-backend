# Feature — Contrôle du montant encaissé (`validatePaymentAmount`)

## Rôle

`amount` (racine) et `items[].total` sont **fournis par le client** → jamais de
confiance. Avant tout appel MobileWallet, `postTransaction.service` **recalcule**
tout côté serveur (`src/utils/validator/validatePaymentAmount.js`) pour empêcher :
sous-paiement, sur-paiement, livraison facturée en double, total/amount trafiqués.

> Exclu pour un **paiement partiel** (`mobileApp` avec `amount < currentAmount`) :
> il encaisse volontairement moins que le total.

---

## La brique de base : `total` d'une commande

Le prix d'un plat affiché contient **déjà** livraison + marge + frais (fondus par
`deliveryPricing`, cf. [pricing.md](./pricing.md)). Le `total` d'une commande est donc :

```
total = (prices[selectedPriceIndex − 1].price × quantity)   // plat × quantité
      + Σ(extra.prix        où status === true)              // extra coché : ×1
      + Σ(drink.prix × drink.quantite   où status === true)  // drink coché : × sa quantite
```

> ⚠️ `selectedPriceIndex` est en **base 1** (1 = `prices[0]`).
> ⚠️ `drink[].quantite` est **propre au drink**, indépendant de `quantity` du plat.
> ⚠️ **`delivery.prix` n'entre JAMAIS dans le `total`.** La livraison est déjà dans
> le prix du plat. L'ajouter = double facturation.

**Niveau ITEM** (toujours, tous les cas) : pour chaque commande, `total` reçu doit
égaler ce total recalculé. Au **premier** écart → **400** immédiat, sans traiter les
items suivants ni sommer.

---

## Les deux cas, une fois les items validés

### Cas 1 — livraison OFFERTE (bonus / campagne)

Un `bonusCode` valide (ou le mode campagne) rend la livraison offerte. **Cela ne
change RIEN au montant** :

- `delivery.prix` n'était déjà **pas** dans le `total` → il n'y a rien à retirer ;
- la gratuité est absorbée par la **marge** côté `settleDelivery` (`covered_by`),
  pas par le paiement.

→ Le user paie `total` plein. `amount == Σtotal`. **Aucune déduction.**

> Déduire `delivery.prix` ici ferait payer le user "en moins" pour une livraison
> jamais ajoutée. C'est le piège à éviter.

### Cas 2 — livraison NON offerte, PANIER groupé

La livraison étant fondue dans **chaque** plat, plusieurs commandes livrées
**ensemble** (une seule course réelle) ne doivent facturer qu'**une** livraison. On
regroupe les commandes livrées (`delivery.status === true`) :

| Mode | Clé de groupe |
|---|---|
| **express** | `fastFoodId + zone` |
| **time** | `fastFoodId + zone + heure` |

Un groupe de **N** commandes ⇒ on déduit `(N−1) × delivery.prix` (pris tel quel du
payload). Zones/créneaux différents = courses distinctes = **0 déduction**.

> La cohérence des créneaux d'une même boutique (même type/date/heure) est garantie
> **en amont** par `validateCartDelivery` (cf. [orders.md](./orders.md)) : deux
> créneaux différents pour une boutique sont refusés avant d'arriver ici.

---

## Contrôle final (niveau PANIER)

```
attendu = Σ(totaux recalculés) − (livraisons en double)
amount == attendu ?   sinon → 400
```

---

## Récapitulatif des cas (vérifiés)

| Cas | Composition | Déduction | Résultat |
|---|---|---|---|
| 1 cmd normale | plat + extras + drinks | 0 | `amount == total` |
| 1 cmd **bonus/campagne** | idem (delivery.prix ignoré) | **0** | `amount == total` (gratuité en marge) |
| Panier, cmd **isolées** (zones/créneaux ≠) | par cmd | 0 | 2 livraisons dues |
| Panier, **N cmd même groupe** (express: ff+zone / time: ff+zone+heure) | par cmd | **(N−1)×delivery.prix** | 1 seule livraison due |
| total ou amount trafiqué | — | — | **400** |

---

## Fichiers

- `src/utils/validator/validatePaymentAmount.js` — `validatePaymentAmount(amount, items)`,
  `recomputeItemTotal`, `duplicateDeliveryDeduction`, `deliveryGroupKey`.
- Appelé par `src/services/transaction/postTransaction.service.js` (avant MobileWallet).
- Prix affiché : `src/services/pricing/deliveryPricing.js`.
- Champs commande : `src/interface/orderFields.js`.
