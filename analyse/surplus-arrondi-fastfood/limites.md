# Limites — ce que le garde-fou ne couvre pas

> Retour à l'[index](./README.md).

## Le seuil est GLOBAL, pas par boutique

`fastfood_min_covered_course` s'applique à **toutes** les boutiques, quelle que
soit leur zone la plus chère.

Conséquence directe : une boutique dont la zone maximale est 1 000 se voit refuser
des prix qu'elle pourrait parfaitement assumer.

```
brut 3 000 → surplus 74 → couvre une course de 1 193

  boutique avec zone max 1 000 : le prix tiendrait sans problème
  seuil global 1 400           : REFUSÉ
```

C'est un choix **conservateur assumé**. Au moment où le marchand saisit son prix,
la course n'existe pas et le panier non plus : on ne peut pas savoir quelle zone
sera choisie. Le seuil global prend donc le pire cas.

> Piste si la friction devient réelle : indexer le seuil sur la zone maximale
> déclarée par la boutique, et **revalider tout son catalogue** quand elle change
> ses zones. Non implémenté — le coût est là, dans la revalidation en cascade.

---

## Ce que le surplus ne finance pas

| Situation                     | Pourquoi                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Livraison **offerte**         | c'est la course **entière** qu'il faut financer, pas seulement ses frais — voir [architecture/pricing-free-delivery-cost.md](../../architecture/pricing-free-delivery-cost.md) |
| Régime `platform`             | la zone y est fondue dans le prix du plat : elle finance déjà la course, et le garde-fou est sauté                                              |
| Menus **déjà en base**        | non contrôlés jusqu'à leur prochaine modification — aucune migration de données                                                                 |
| Extras et boissons            | ils portent leurs propres frais, mais ni marge ni livraison : ils ne contribuent pas au surplus                                                 |

---

## La marge n'est pas garantie au franc près

Même sur un prix accepté, trois arrondis au supérieur s'empilent — prix juste,
commission, retrait — et laissent un résidu de quelques francs qu'aucun
pourcentage ne capture.

Le chiffrage complet est dans
[architecture/pricing-margin-risk.md](../../architecture/pricing-margin-risk.md) :
601 combinaisons en perte sur 559 776 (0,11 %), pire perte **11 F**. Accepté.
