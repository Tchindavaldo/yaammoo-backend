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
Le régime **effectif** est lu par `fastfoods.repo` : si `settings_app.platform_delivery_all`
vaut `true`, toute boutique ayant des zones plateforme est lue en `platform`
(`fastfoods.delivery_by` n'est jamais réécrit, `deliveryByOwn` garde le réglage
propre). Le régime est **figé au paiement** dans `order_settlements.delivery_by`
(migration 074) : les crédits marchand et livreur le relisent, jamais la boutique.


| Régime | Base fondue dans le plat | Course |
|---|---|---|
| `fastfood` (le marchand livre) | prix brut + **marge par palier** (`fastfood_margin` 200, palier 2 = 300 dès brut 3500) | facturée **à part** (`delivery.prix`, tarif réel de la zone dans le créneau), versée au **marchand** |
| `platform` (Yaammoo livre) | prix brut + **zone périodique MAX** + `platform_margin` (100) | zone MAX **fondue** dans le prix du plat **ET** course de la zone choisie (`delivery.prix`, périodique brut ou express habillé) **ajoutée au total** : marge en plus pour la plateforme, **voulu** (décision du 14/11/2026). Versée au **livreur** à la livraison, plafonnée au tarif de la zone |

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

**Course partagée** (panier groupé) : une seule course par départ. Les autres
commandes ont `courseBilled = false`, `driverAmount = 0` (dans les DEUX
régimes) et `itemsCharged = total − delivery.prix` (la course a été déduite du
montant encaissé). **Groupage** (départ déjà payé et pas encore parti,
`paidDeliveryGroups`) : la course de la nouvelle commande est **offerte**
(total = base, `free_reason = 'grouped'`, `courseBilled = false`). Corrigé le 14/11/2026 : avant, `itemsCharged` gardait la
course (marge tracée gonflée).
**Livreur plateforme : payé sur CHAQUE commande, VOULU** (décision du
14/11/2026, la zone MAX est fondue dans chaque plat), groupage compris. Seule
exception : dans un même panier, une seule commande porte la course
(`driverAmount = 0` pour les autres).

### Annulation d'une commande payée (détail : [order-cancel.md](./order-cancel.md))

```
frais réels = ⌈dépôt % × base⌉ + ⌈commission MW % × base⌉   (la réserve paie le payout)
client annule (pending)          : rendu = base − frais réels
marchand annule (avant livraison): rendu = base ; frais réels débités du marchand
reprise marchand = merchant_debit (solde peut devenir négatif)
```

Devis boutique (`GET /order/:orderId/merchant-cancel-quote`) : même calcul (`quoteCancel`), renvoie `refund` (base complète) et `fees` (débités du marchand).

Devis client (`GET /order/cancel-quote`) : renvoie aussi `phone`, le numéro qui a
payé, seul destinataire du remboursement. **Annulation d'office** : commande
payée **par pawaPay** non livrée après `settings_app.order_auto_cancel_days` jours (anciennes commandes sans vrai paiement, commandes sans trace de paiement
`pending_payments` donc irremboursables, boutiques masquées : jamais annulées d'office ;
sans trace : alerte `app_errors`) (7, migration
076, 0 = désactivé) = annulation par le restaurant (`orderAutoCancelJob`, 1×/h).
**Dette de remboursement** : solde marchand < 0 alors qu'il a une reprise
`merchant_debit` ⇒ `settlementPrecheck` refuse toute commande de la boutique
(`merchant_debt`, 422) et pousse au marchand la raison, à chaque tentative
(`merchantDebtGuard`). Pas de seuil de montant : c'est la cause du négatif.

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
| **Frais SMS** (`sms_fee`) | code SMS de vérification d'un numéro de retrait | ⌈coût Bird réel USD × taux USD→XAF du jour⌉, débité du réseau vérifié ; négatif non bloquant ; numéro d'un livreur de boutique WhatsApp : débité à sa **boutique** ([wallet.md](./wallet.md)) |

- **Part plateforme** (`GET /wallet/admin/platform-share`) : marges des commandes
  non annulées + frais SMS − versements aux boutiques − retraits admin
  (`platform_withdrawal`, `POST /wallet/admin/platform-withdraw`, même réseau).
  Détail : [wallet.md](./wallet.md).
- Retrait **même réseau** : **0 F** pour le marchand (réserve déjà prise au dépôt).
- **Boutique WhatsApp** : à la livraison validée par QR, son crédit de la commande
  part seul sur son numéro (même réseau 0 F ; interréseau : frais pris sur ce
  crédit), sans cooldown ([wallet.md](./wallet.md), « Versement automatique »).
  Commande confiée à un **livreur** : ce crédit part sur le numéro OM / MoMo validé
  **du livreur** (mêmes règles de réseau), débité du solde de la boutique ; le livreur
  le remet à la boutique (décision du 16/11/2026, `withdrawals.driver_id`).
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
   Avant tout : refus `delivery_mode_changed` si `order.deliveryBy` (régime vu
   par le client, posé par l'app) ≠ régime effectif actuel (bascule marchand ↔
   plateforme), puis `price_changed` si la commande, recalculée sur la vue home
   actuelle (`repriceCart.repriceOrder`), a un plat/prix/zone disparu ou un
   total différent (> 1 F). Message des refus « prix changés » : « Les prix de
   livraison de cette boutique viennent de changer… ». Toute réponse 422 porte
   `fastFoodIds` : l'app recharge ces boutiques.
   **Panier** : à chaque changement de boutique, de plat (`updateMenu`,
   `deleteMenu`) ou de réglage global, et à chaque `GET /order/user/all`, les
   commandes `pendingToBuy` sont recalculées aux prix actuels (plat, extras,
   boissons, course du créneau, total, `deliveryBy`) et poussées au client
   (`userOrderUpdated`) ; plat supprimé, prix choisi, extra/boisson coché, zone
   ou créneau disparus ⇒ `needsReview: true`. Boutique fermée ou plat seulement
   indisponible : panier non touché, et le précheck ne refuse pas pour « prix ».
   Sur `negative_margin`, `precheckSuggestions` calcule (en rejouant le
   règlement simulé) la **course maximale** de la zone/créneau et le **prix
   réel minimum** du plat (règle de la page menu respectée), puis envoie un
   **push au marchand** (« baissez la livraison … à X F, ou passez le plat à
   Y F, sinon contactez l'administrateur »), au plus 1 fois/heure par cas.
   Régime plateforme : seul « contactez l'administrateur », et **push aux
   administrateurs** (`users.is_admin`), 1 fois/heure par cas.
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
