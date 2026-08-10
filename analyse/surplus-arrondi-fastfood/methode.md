# Méthode — rejouer les calculs

> Retour à l'[index](./README.md).

## Le piège qui a faussé une première version

`validateMenuPrices` prend **trois** arguments : `(menu, fastfood, pricing)`.

L'appeler avec deux fait passer les réglages dans `fastfood`, `pricing` devient
`undefined`, `fastfoodMinCoveredCourse` tombe à 0 — et **tout est accepté en
silence**, sans la moindre erreur.

```js
validateMenuPrices({ prices: [{ price: b }] }, pricing);          // ❌ garde-fou désactivé
validateMenuPrices({ prices: [{ price: b }] }, fastfood, pricing); // ✅
```

Une première version de cette analyse annonçait ainsi un surplus minimal de **0**
(brut 3 920) au lieu de **87**. Vérifier qu'au moins un prix connu est refusé
(3 000, 9 500 ou 10 000) est le contrôle le plus rapide.

---

## Le calcul

```js
const p = require('./src/services/pricing/deliveryPricing');
const { validateMenuPrices } = require('./src/services/pricing/menuPriceGuard');

const pricing = {
  paymentFeePercent: 5,
  priceRoundingStep: 500,
  fastfoodMargin: 200,
  fastfoodMarginTier2MinBrut: 3500,
  fastfoodMarginTier2Margin: 300,
  fastfoodMinCoveredCourse: 1400,
  withdrawalOperator: 'mtn',
  withdrawalFees: { mtn: { threshold: 4200, flat: 54, percent: 1.2, addend: 4 } },
};
const fastfood = { deliveryBy: 'fastfood' };

const marge   = p.marginForBrut(brut, pricing);
const juste   = p.withAllFees(brut + marge, pricing);
const affiche = p.roundToStep(juste, { step: 500, amortizationMax: 0 });
const surplus = affiche - juste;
const refuse  = validateMenuPrices({ prices: [{ price: brut }] }, fastfood, pricing).length > 0;
```

`amortizationMax: 0` est essentiel : en régime fastfood on **ne descend jamais**.
Passer `driverAmortizationMax` ici produirait les valeurs du régime plateforme.

## Populations balayées

```
prix ronds  : brut 500 → 15 000, pas de 500      (30 valeurs)
tous prix   : brut 100 → 15 000, pas de 10    (1 491 valeurs)
```

## Contrôles de cohérence

Trois invariants qui doivent tenir après tout changement de réglage :

```
prix refusés (plafond 1400, pas de 500) : 3 000, 9 500, 10 000
surplus minimal accepté, tous prix       : 87
surplus moyen, prix ronds                : 252
```

---

## Réglages dont tout dépend

| Clé                           |     Valeur | Effet sur cette analyse                        |
| ----------------------------- | ---------: | ----------------------------------------------- |
| `price_rounding_step`         |        500 | **crée** le surplus — le changer invalide tout |
| `fastfood_margin`             |        200 | décale le prix juste, donc le surplus          |
| `fastfood_margin_tier_2_*`    | 3500 / 300 | provoque la remontée observée à 3 500          |
| `fastfood_min_covered_course` |      1 400 | ce qu'on exige du surplus                      |
| `payment_fee_percent`         |          5 | entre dans le diviseur (6,2 %)                 |
| `withdrawal_fee_mtn_percent`  |        1,2 | idem                                            |
| `withdrawal_fee_mtn_threshold`|      4 200 | décide forfait 54 ou `1,2 % + 4`               |
