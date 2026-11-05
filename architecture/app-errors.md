# Journal des erreurs — `app_errors` (migration 068)

Table **persistante** des erreurs importantes. Les logs Fly sont tronqués et
perdus au redémarrage : ici un admin retrouve le cas précis sans refaire le
calcul à la main.

| Colonne | Contenu |
|---|---|
| `scope` | domaine : `settlement`, `credit_merchant`, `payment_precheck`… |
| `code` | cause : `negative_margin`, `settlement_insert_failed`, `settlement_missing`, `delivery_price_mismatch`… |
| `message` | explication lisible, chiffres compris |
| `order_id`, `user_id`, `fastfood_id` | qui est concerné |
| `context` | données complètes (règlement calculé, livraison, paiement…) |
| `resolved`, `resolved_at`, `resolved_note` | suivi de la régularisation |

Écriture : `repos.appErrors.record({ scope, code, message, orderId, userId, fastFoodId, context })`
(`src/repositories/supabase/appErrors.repo.js`), best-effort : ne casse jamais
le flux appelant. Tout nouveau cas d'erreur grave s'y ajoute.

Lecture des cas ouverts :

```sql
select created_at, scope, code, message, order_id from app_errors
where resolved = false order by created_at desc;
```
