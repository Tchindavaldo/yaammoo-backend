# Le surplus d'arrondi — régime FASTFOOD

Combien le surplus d'arrondi rapporte-t-il, et jusqu'où finance-t-il la course ?

Cette analyse existe parce que la réponse a été reconstruite plusieurs fois de
mémoire, avec des chiffres différents à chaque fois. **Tout ici est calculé avec
le code de production** — `withAllFees`, `roundToStep`, `marginForBrut`,
`validateMenuPrices`.

| Fichier                                        | Répond à                                                       |
| ---------------------------------------------- | --------------------------------------------------------------- |
| [mecanisme.md](./mecanisme.md)                 | D'où vient le surplus, et ce qu'une course coûte réellement     |
| [valeurs.md](./valeurs.md)                     | Moyennes, minimum garanti, distribution, tableau des prix ronds |
| [plafond.md](./plafond.md)                     | Que se passe-t-il si on baisse `fastfood_min_covered_course` ?  |
| [limites.md](./limites.md)                     | Seuil global vs par boutique, ce que le surplus ne finance pas  |
| [methode.md](./methode.md)                     | Rejouer les calculs — et le piège qui a faussé une version      |

---

## Les trois chiffres à retenir

```
surplus MOYEN    252   sur les prix ronds (multiples de 500)
surplus MINIMAL   87   garanti par le garde-fou, tous prix confondus
prix ACCEPTÉS    83 %  au plafond de 1 400
```

Le surplus **ne dépend que du prix du plat**. Ni de la zone, ni du plafond, ni de
la quantité — c'est le point le plus souvent mal compris.

> Contexte fonctionnel : [architecture/pricing.md](../../architecture/pricing.md).
> Garde-fou : `services/pricing/menuPriceGuard.js`.

> ⚠️ Changer `price_rounding_step`, `fastfood_margin` ou `payment_fee_percent`
> **invalide tous les chiffres de ce dossier**. Voir [methode.md](./methode.md).
