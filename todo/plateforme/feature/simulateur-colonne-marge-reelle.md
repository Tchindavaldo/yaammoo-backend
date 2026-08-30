# Simulateur — colonne MARGE RÉELLE dans les tableaux

[ ] Ajouter une colonne « marge » aux trois tableaux du simulateur
    (`scratchpad/simulateur-prix.html`), pour voir d'un coup d'œil si la marge
    baisse, tient, ou augmente.
    - Aujourd'hui les tableaux montrent le **surplus** et la **course couverte**
      — des intermédiaires. Ce qui décide, c'est ce qu'il reste réellement.
    - Marquer visuellement les trois cas : `<` marge due (perte), `=` (limite),
      `>` (gain).

### La marge dépend de la ZONE, pas seulement du prix

C'est le piège : un même brut donne des marges différentes selon la course
choisie par le client. Brut 3 000 (marge due 200, surplus 74) :

| Zone  | Marge réelle |
| ----- | ------------ |
| 1 000 | 219          |
| 1 200 | 207          |
| 1 320 | **200** ← limite exacte |
| 1 325 | 199          |
| 1 400 | 195          |

- Le tableau doit donc calculer la marge **à une zone donnée**. Deux pistes :
  soit la « course min à couvrir » déjà saisie, soit un champ dédié
  « zone de simulation » — à trancher.
- Utile aussi pour montrer que le garde-fou est **plus strict que nécessaire** :
  il refuse le brut 3 000 dès que le seuil dépasse 1 193, alors que la marge ne
  casse vraiment qu'à 1 325. L'écart vient du diviseur 6,2 %, qui applique
  1,2 % de retrait même quand le forfait de 54 ne bouge pas (choix prudent
  assumé, cf. `analyse/surplus-arrondi-fastfood/mecanisme.md`).

### Formule

```
total   = affiché + zone
marge   = total − commission(total) − retrait(total − commission) − brut − zone
verdict = marge vs marginForBrut(brut)
```