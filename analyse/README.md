# Dossier `analyse/`

Analyses chiffrées produites en session, **hors documentation d'architecture**.

La différence avec `architecture/` :

| Dossier         | Contenu                                                     |
| --------------- | ------------------------------------------------------------ |
| `architecture/` | comment le backend **fonctionne** — contrat, routes, formules |
| `analyse/`      | ce que les chiffres **disent** — balayages, seuils, arbitrages |

Ces fichiers ne décrivent pas le code : ils servent à **décider**. Quand une
question revient (« et si on baissait le plafond ? », « combien on perd si… »),
la réponse doit être ici plutôt que recalculée de zéro.

| Dossier                                                        | Question à laquelle il répond                                |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| [surplus-arrondi-fastfood/](./surplus-arrondi-fastfood/)       | Quel surplus garantit un prix de menu, et que finance-t-il ? |

Chaque analyse est un **dossier** : un `README.md` qui donne les chiffres clés et
l'index, puis un fichier par question. Aucun fichier fourre-tout.

> ⚠️ Tous les chiffres dépendent des réglages en vigueur (`price_rounding_step`,
> `fastfood_margin`, `payment_fee_percent`, barème de retrait). En changer un
> **invalide** les analyses : chaque fichier rappelle comment rejouer son calcul.
