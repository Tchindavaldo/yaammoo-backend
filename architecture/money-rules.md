# ARGENT — règles obligatoires (le cœur du modèle économique)

> **Ce fichier est injecté par hook à chaque message qui parle d'argent, et sa
> relecture récente est EXIGÉE avant toute modification d'un fichier d'argent.**
> Ce n'est pas une option : c'est de l'argent réel, en production.

## 0. La règle d'or

**Aucun chiffre d'argent (frais, marge, crédit, retrait, prix) n'est donné,
écrit ou codé de mémoire.** Avant chaque chiffre :

1. **Relire les valeurs en base** (elles changent à chaud) :
   ```sql
   select 'pricing' t, key, value::text from settings_pricing
   union all select 'withdrawal', key, value::text from settings_withdrawal
   union all select 'delivery', key, value::text from settings_delivery
   union all select 'deployment', key, value::text from settings_deployment where key = 'payment_aggregator';
   ```
2. **Relire la formule dans le code** qui fait foi (§1), pas dans sa mémoire.
3. **Calculer chaque ligne**, arrondis compris (chaque frais est arrondi à
   l'excès SÉPARÉMENT). Un chiffre non vérifié est annoncé comme tel.
4. Pour une commande réelle : relire `order_settlements`, `transactions`
   (`merchant_credit`), `pending_payments` et **`app_errors`** avant de conclure.

## 1. Sources de vérité (le code fait foi)

| Sujet | Fichier |
|---|---|
| Frais de paiement par agrégateur | `src/services/pricing/paymentFees.js` |
| Frais kiosque (retrait en espèces) | `src/services/pricing/withdrawalFees.js` |
| Prix affiché, zones, marge par palier | `src/services/pricing/deliveryPricing.js` |
| Répartition de la course | `src/services/pricing/deliverySplit.js` |
| Règlement (cascade, `order_settlements`) | `src/services/order/settleDelivery.service.js` |
| Simulation avant USSD | `src/services/order/settlementPrecheck.service.js` |
| Contrôle du montant payé | `src/utils/validator/validatePaymentAmount.js` |
| Crédit marchand / livreur | `src/services/transaction/creditMerchant.service.js`, `creditDriver.service.js` |
| Solde, retrait, frais interréseau | `src/services/wallet/*`, `src/repositories/supabase/transactions.repo.js` |

Docs détaillées : [pricing.md](./pricing.md), [pricing-fees.md](./pricing-fees.md),
[pricing-delivery-modes.md](./pricing-delivery-modes.md),
[pricing-platform-delivery.md](./pricing-platform-delivery.md),
[pricing-settlement.md](./pricing-settlement.md),
[payment-amount-check.md](./payment-amount-check.md), [wallet.md](./wallet.md),
[app-errors.md](./app-errors.md).

## 2. Les deux niveaux

### Niveau 1 — Prix AFFICHÉ (avant paiement)

Le régime dépend de `fastfoods.delivery_by` (décidé par l'admin) :

| Régime | Base fondue dans le plat | Course |
|---|---|---|
| `fastfood` (le marchand livre) | prix brut + **marge par palier** (`fastfood_margin` 200, palier 2 = 300 dès brut 3500) | facturée **à part** (`delivery.prix`, tarif réel de la zone dans le créneau), versée au **marchand** |
| `platform` (Yaammoo livre) | prix brut + **zone périodique MAX** + `platform_margin` (100) | **fondue** dans le prix du plat ; express facturé à part ; versée au **livreur** à la livraison, plafonnée au tarif de la zone |

```
plat affiché = withAllFees(base + frais kiosque) puis arrondi au pas (500)
  fastfood : arrondi toujours vers le HAUT
  platform : peut DESCENDRE (absorbé par la course, ≤ driver_amortization_max)
total payé = plat affiché (+ extras/boissons habillés de leurs frais) + delivery.prix si livrée et non offerte
```

### Niveau 2 — Règlement (après paiement), la cascade

```
itemsCharged   = order.total                         (ce que le client a payé)
paymentFee     = frais de paiement inclus (§3)
withdrawalFee  = frais kiosque, UNE fois par boutique et par panier (§3)
net            = itemsCharged − paymentFee − withdrawalFee
itemsReal      = Σ rawPrice figés (plat × qté + extras/boissons cochés)   ← FIGÉ
driverAmount   = tarif de la zone, TYPE + CRÉNEAU choisis (fastfood)      ← dû
                 min(tarif, net − itemsReal − marge due) (platform)
platformMargin = net − itemsReal − driverAmount                          ← LE RÉSIDU
```

**Crédit marchand** = `items_real + withdrawal_fee + driver_amount` (ce dernier
seulement en régime `fastfood`). Le marchand touche TOUJOURS son prix réel ; la
marge est la seule variable d'ajustement.

## 3. Les frais — ne jamais les confondre

| Frais | Quand | Formule (P = montant payé) |
|---|---|---|
| **Paiement pawaPay** | au dépôt, retenu sur P | ⌈dépôt[réseau] % × P⌉ + ⌈commission MobileWallet % × P⌉ + ⌈**réserve de retrait**[réseau] % × P⌉ |
| — dépôt | | `pawapay_deposit_fee_{mtn,orange}_percent` |
| — commission MobileWallet | | `pawapay_mw_commission_percent` |
| — réserve de retrait | prise **dès le dépôt** : paie le payout pawaPay → Orange/MTN Money du marchand **sur le même réseau** | `pawapay_payout_fee_{mtn,orange}_percent` |
| **Paiement DigiKUNTZ** | tout compris | ⌈`payment_fee_percent` % × P⌉ |
| **Kiosque** (`withdrawal_fee`) | le marchand retire en **espèces** chez l'agent Orange/MTN | `withdrawal_fee_<réseau>_percent` % × (plats réels + course qu'il livre) + `addend`, ⌈⌉ ; sous `threshold` : `flat` |
| **Interréseau** | le marchand retire vers l'AUTRE réseau | ⌈taux payout pawaPay du réseau de réception × montant⌉, débité **en plus** du solde (devis MobileWallet `/payout/quote` fait foi) |

- Retrait **même réseau** : **0 F** pour le marchand (réserve déjà prise au dépôt).
- Le kiosque fait partie du crédit marchand (part « Frais de retrait » du solde).
- Prix affiché (réseau inconnu) : barème du réseau **le plus cher**. Règlement :
  réseau et agrégateur **réels** du paiement.

## 4. Course : tarif lu dans le CRÉNEAU (périodique) ou la liste EXPRESS

Un même lieu a un prix par **type**, et les deux listes n'ont pas la même forme :

| Type | Où | Prix |
|---|---|---|
| **périodique** (`time`) | `deliveryHours[].periodicZones` | par lieu ET par **créneau** : Banekane 500 F à 09:12, 100 F à 13:06 |
| **express** | `expressZones` (boutique, migration 073) | par lieu, **sans heure** : la course part dès que la commande est prête |

`zoneDeliveryPrice(source, zone, type, delivery.time)` : l'heure ne filtre que
le périodique. Ne jamais prendre le premier lieu trouvé dans toutes les heures
(bug du 05/11/2026). Régime plateforme : `platformDeliveryZones` (périodique)
et `platformExpressZones` (express).

## 5. Garde-fous en place

1. **Avant la demande USSD** (`settlementPrecheck`) : règlement simulé ; refus
   422 si course payée ≠ tarif du créneau (`delivery_price_mismatch`), calcul
   en échec (`settlement_failed`) ou marge négative (`negative_margin`).
   Sur `negative_margin`, `precheckSuggestions` calcule (en rejouant le
   règlement simulé) la **course maximale** de la zone/créneau et le **prix
   réel minimum** du plat (règle de la page menu respectée), puis envoie un
   **push au marchand** (« baissez la livraison … à X F, ou passez le plat à
   Y F, sinon contactez l'administrateur »), au plus 1 fois/heure par cas.
   Régime plateforme : seul « contactez l'administrateur ».
2. **Après paiement** : pas de règlement ⇒ **aucun crédit** (jamais le total
   client), alerte dans `app_errors`.
3. **Base** : `order_settlements_margin_chk` et `order_deliveries_margin_chk`
   (`platform_margin >= 0`) sont **présentes en prod** (constaté le 05/11/2026),
   bien que la migration 038 prévoie leur levée.
4. Tout échec d'argent est écrit dans **`app_errors`** avec tous les chiffres.

## 6. Exemple vérifié (commande tpmjUK9lsMg8Ta0dy2gM, 05/11/2026)

Régime fastfood, Orange, pawaPay (1,77 % / 0,1 % / 1,0 %), kiosque 1,2 % + 4.

| Poste | Calcul | Montant |
|---|---|---|
| Payé | plat 500 + course 100 (Banekane, 13:06) | 600 |
| Dépôt | ⌈1,77 % × 600⌉ | 11 |
| Commission MW | ⌈0,1 % × 600⌉ | 1 |
| Réserve de retrait | ⌈1,0 % × 600⌉ | 6 |
| Kiosque | ⌈1,2 % × (200 + 100) + 4⌉ | 8 |
| Plat réel | rawPrice | 200 |
| Course | créneau 13:06 | 100 |
| **Crédit marchand** | 200 + 100 + 8 | **308** |
| **Marge** | 600 − 18 − 8 − 200 − 100 | **274** |

## 7. Interdits

- Donner un chiffre d'argent sans avoir fait le §0.
- Créditer un marchand sur le total client.
- Écrire dans `transactions`, `order_settlements`, `order_deliveries`,
  `withdrawals` sans l'accord explicite de l'utilisateur, et sans `app_errors`
  pour tracer une régularisation.
- Modifier une formule sans mettre à jour CE fichier et la doc détaillée.
