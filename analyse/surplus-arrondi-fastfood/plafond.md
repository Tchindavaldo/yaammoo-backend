# Effet d'une baisse du plafond

> Retour à l'[index](./README.md). Valeurs de référence : [valeurs.md](./valeurs.md).

Que se passe-t-il si on baisse `fastfood_min_covered_course`, aujourd'hui à
**1 400** ?

## Trois idées fausses à écarter d'abord

| Idée fausse                                                | Réalité                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| « baisser le plafond augmente le surplus »                 | le surplus **ne bouge jamais** — il dépend du prix du plat, rien d'autre |
| « la colonne *course couverte* est ce que je peux offrir » | c'est une capacité **théorique** ; la zone reste plafonnée à 1 400     |
| « un prix refusé n'a pas de prix affiché »                 | il en a un, calculé normalement ; il est refusé à l'enregistrement     |

Ce que le plafond change, c'est **combien on exige** du surplus — donc combien de
prix passent le garde-fou.

```
brut 3 000 → surplus 74, toujours 74

  plafond 1 400 → exige 87  → REFUSÉ
  plafond 1 000 → exige 62  → accepté
  plafond   800 → exige 50  → accepté
```

---

## Tous les prix (pas de 10, brut 100 → 15 000)

| Plafond   | Prix acceptés | %        | Surplus min accepté |
| --------- | ------------: | -------: | ------------------: |
| **1 400** |     **1 232** | **83 %** |              **87** |
| 1 200     |         1 265 |     85 % |                  75 |
| 1 000     |         1 310 |     88 % |                  62 |
| 800       |         1 344 |     90 % |                  50 |
| 600       |         1 378 |     92 % |                  38 |
| 400       |         1 418 |     95 % |                  25 |
| 300       |         1 433 |     96 % |                  20 |
| 200       |         1 450 |     97 % |                  13 |
| 100       |         1 470 |     99 % |                   7 |

## Prix ronds seulement (multiples de 500)

| Plafond | Acceptés / 30 | Surplus moyen | Refusés               |
| ------- | ------------: | ------------: | --------------------- |
| 1 400   |            27 |           274 | 3 000, 9 500, 10 000  |
| 1 200   |            27 |           274 | 3 000, 9 500, 10 000  |
| 1 000   |            28 |           267 | 9 500, 10 000         |
| 800     |            29 |           260 | 10 000                |
| 600     |            29 |           260 | 10 000                |
| 400     |            29 |           260 | 10 000                |
| 300     |            30 |           252 | aucun                 |

---

## Conclusion : baisser le plafond ne débloque presque rien

Passer de **1 400 à 800** :

```
tous les prix : 83 % → 90 %        +7 points
prix ronds    : 27/30 → 29/30      +2 prix seulement
```

Le coût, lui, est immédiat : le surplus minimal tombe de **87 à 50**, et plus
aucune zone au-dessus de 800 n'est financée par le seul surplus.

> **Le plafond de 1 400 coûte peu en friction marchande.** Ce qui exclut des prix,
> ce n'est pas sa hauteur — c'est la **géométrie du pas de 500** : quelques bandes
> étroites tombent juste sous un palier, quel que soit le seuil.

## Si l'on veut au contraire RELEVER le plafond

Le sens inverse est traité dans
[architecture/pricing-margin-risk.md](../../architecture/pricing-margin-risk.md),
qui chiffre les pertes acceptées plafond par plafond (700 → 5 000). Résumé : la
perte unitaire monte lentement, mais le catalogue se restreint vite.
