# Valeurs mesurées — moyennes, minimum, distribution

> Retour à l'[index](./README.md). Mécanisme : [mecanisme.md](./mecanisme.md).

Balayage au plafond `fastfood_min_covered_course = 1400`, marge 200 / 300 au
palier 3 500, pas d'arrondi 500.

## Les moyennes

| Population                       |     n | Moyenne | Médiane | Min    | Max |
| -------------------------------- | ----: | ------: | ------: | -----: | --: |
| **Prix ronds** (pas de 500)      |    30 | **252** |     251 |     23 | 490 |
| Prix ronds **acceptés**          |    27 | **274** |     262 | **88** | 490 |
| Tous les prix (pas de 10)        | 1 491 |     250 |     250 |      0 | 498 |
| Tous les prix **acceptés**       | 1 232 | **293** |     293 | **87** | 498 |

Deux lectures :

- **252 est la moyenne des prix ronds**, celle qui compte en pratique — c'est ce
  qu'un marchand saisit. Sur les seuls prix qu'il pourra réellement enregistrer,
  elle monte à **274**.
- Le garde-fou relève la moyenne en éliminant les surplus faibles : 250 → 293 sur
  l'ensemble des prix.

### Par palier de marge, prix ronds acceptés

| Palier               |   n | Moyenne | Min | Max |
| -------------------- | --: | ------: | --: | --: |
| Palier 1 (< 3 500)   |   5 |     153 | 101 | 206 |
| Palier 2 (≥ 3 500)   |  22 | **302** |  88 | 490 |

Le palier 2 finance deux fois mieux : la marge de 300 pousse le prix juste plus
loin dans le pas, ce qui laisse un surplus plus large en moyenne.

---

## Le minimum garanti : 87

C'est le plancher sur **tous** les prix acceptés, tous pas confondus (brut 9 470).

```
87 / 6,2 % = 1403      soit exactement le seuil exigé
```

Le garde-fou fait son travail : aucun prix accepté ne descend sous la couverture
de 1 400. Sur les prix ronds seuls, le plancher est **88** (brut 9 000).

### Distribution des 1 232 prix acceptés

| Surplus   | Prix |
| --------- | ---: |
| 87 – 99   |   35 |
| 100 – 149 |  154 |
| 150 – 199 |  143 |
| 200 – 249 |  151 |
| 250 – 299 |  151 |
| 300 – 349 |  154 |
| 350 – 399 |  145 |
| 400 – 449 |  155 |
| 450 – 498 |  144 |

La répartition est **uniforme** au-delà de la première tranche : le surplus dépend
de la position du prix juste dans le pas de 500, ce qui est essentiellement
aléatoire du point de vue du marchand.

---

## Les 30 prix ronds, un par un

| brut   | affiché | surplus | couvre 1 400 ? |
| -----: | ------: | ------: | :------------: |
|    500 |   1 000 |     206 | ✅             |
|  1 000 |   1 500 |     180 | ✅             |
|  1 500 |   2 000 |     153 | ✅             |
|  2 000 |   2 500 |     127 | ✅             |
|  2 500 |   3 000 |     101 | ✅             |
|  3 000 |   3 500 |      74 | ❌ **refusé**  |
|  3 500 |   4 500 | **443** | ✅             |
|  4 000 |   5 000 |     414 | ✅             |
|  4 500 |   5 500 |     382 | ✅             |
|  5 000 |   6 000 |     349 | ✅             |
|  5 500 |   6 500 |     316 | ✅             |
|  6 000 |   7 000 |     284 | ✅             |
|  6 500 |   7 500 |     251 | ✅             |
|  7 000 |   8 000 |     218 | ✅             |
|  7 500 |   8 500 |     186 | ✅             |
|  8 000 |   9 000 |     153 | ✅             |
|  8 500 |   9 500 |     121 | ✅             |
|  9 000 |  10 000 |      88 | ✅             |
|  9 500 |  10 500 |      55 | ❌ **refusé**  |
| 10 000 |  11 000 |      23 | ❌ **refusé**  |
| 10 500 |  12 000 | **490** | ✅             |
| 11 000 |  12 500 |     457 | ✅             |
| 11 500 |  13 000 |     425 | ✅             |
| 12 000 |  13 500 |     392 | ✅             |
| 12 500 |  14 000 |     360 | ✅             |
| 13 000 |  14 500 |     327 | ✅             |
| 13 500 |  15 000 |     294 | ✅             |
| 14 000 |  15 500 |     262 | ✅             |
| 14 500 |  16 000 |     229 | ✅             |
| 15 000 |  16 500 |     196 | ✅             |

**Trois refusés seulement** : 3 000, 9 500, 10 000.

> ⚠️ Un prix refusé **a bien un prix affiché** — il est calculé normalement. Il
> est seulement rejeté à l'enregistrement du menu (`POST /menu`, `PUT /menu`).

### Le motif

Le surplus décroît d'environ **33 à chaque palier de 500**, puis remonte d'un coup
quand le prix juste franchit un multiple. Deux remontées ici :

```
3 000 →  74     dernier avant franchissement
3 500 → 443     +369 : franchissement ET passage au palier de marge 300
...
10 000 →  23    dernier avant franchissement
10 500 → 490    +467
```

> **Le meilleur prix rond est 3 500** : marge de palier 300 ET surplus 443.
> Le pire accepté est 9 000 (surplus 88, tout juste au-dessus du plancher).
