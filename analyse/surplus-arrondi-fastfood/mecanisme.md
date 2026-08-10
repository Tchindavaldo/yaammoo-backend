# Mécanisme — d'où vient le surplus, ce que la course coûte

> Retour à l'[index](./README.md).

## Le surplus

Régime `fastfood` : la zone n'entre **pas** dans le prix du plat. La course est
facturée à part, au tarif réel — mais la commission et le retrait la frappent
quand même, sans que personne ne les ait payés d'avance.

Ce qui les absorbe, c'est l'écart créé par l'arrondi :

```
juste   = ceil((brut + marge + retrait) / (1 − commission))
affiché = juste arrondi AU SUPÉRIEUR au pas de 500
surplus = affiché − juste
```

Exemple, plat brut 3 000 :

```
3000   prix du marchand
+ 200   marge (palier 1, brut < 3500)
= 3200
+  54   frais de retrait MTN (montant sous le seuil de 4 200 → forfait)
= 3254
÷ 0,95  pour que la commission de 5 % tienne dedans
= 3426   prix juste
→ 3500   arrondi au pas de 500

surplus = 3500 − 3426 = 74
```

> ⚠️ **Le surplus ne dépend que du prix du plat.** Ni de la zone choisie, ni du
> plafond configuré, ni de la quantité commandée. Baisser le plafond ne le fait
> pas grossir — voir [plafond.md](./plafond.md).

---

## Ce qu'une course coûte réellement

Le client paie la course, le marchand la reçoit **entière**. Ce qui sort de ta
marge, ce sont uniquement les **frais que la course fait naître**.

Plat brut 3 000 (affiché 3 500), zone 1 400 :

```
sans la course : total 3500 → commission 175, retrait 54
avec la course : total 4900 → commission 245, retrait 60

   commission  +70
   retrait      +6      (4655 dépasse le seuil de 4 200 : on quitte le forfait)
               ────
   à absorber   76
```

Le surplus de ce plat vaut **74**. Il en manque 2 :

```
74 − 76 = −2      la marge de 200 tombe à 198
```

Le même calcul sur un plat brut 2 500 (surplus 101) :

```
101 − 76 = +25    la marge de 200 reste intacte, et il reste 25
```

**C'est exactement ce que le garde-fou teste**, et pourquoi le brut 3 000 est
refusé alors que 2 500 passe.

---

## La formule du garde-fou

```
covered = surplus / (payment_fee_percent + withdrawal_percent)
        = surplus / 6,2 %
```

Un prix est accepté si `covered >= fastfood_min_covered_course` (1 400).

> ⚠️ Diviser par la seule commission (5 %) était l'erreur de la première version :
> la course fait **aussi** monter le frais de retrait, quand elle pousse le total
> au-delà du seuil de 4 200.

Vérification sur le plancher réel :

```
surplus 87 → 87 / 0,062 = 1403 ≥ 1400  ✅
surplus 74 → 74 / 0,062 = 1193 < 1400  ❌
```

---

## Ce qui fait varier le surplus

Deux effets se superposent, tous deux visibles dans les
[valeurs mesurées](./valeurs.md) :

| Effet                              | Conséquence                                                            |
| ---------------------------------- | ----------------------------------------------------------------------- |
| **Position dans le pas de 500**    | le surplus décroît d'environ 33 par palier de 500 de brut, puis remonte d'un coup au franchissement suivant |
| **Palier de marge** (3 500)        | la marge passe de 200 à 300, ce qui décale le prix juste et provoque une remontée nette |

C'est pourquoi un plat à 3 500 (surplus 443) finance six fois mieux qu'un plat à
3 000 (surplus 74), alors qu'ils ne diffèrent que de 500 F.
