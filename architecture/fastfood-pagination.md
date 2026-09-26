# `GET /fastfood/all` — pagination par curseur

## Pourquoi

La route renvoyait **tout** le catalogue : toutes les boutiques, tous leurs
menus, plus les bannières. À 5 boutiques c'est invisible ; le catalogue vise
**500 boutiques**, soit plusieurs Mo de JSON avant le premier pixel du home et
501 requêtes SQL (1 pour les boutiques + 1 par boutique pour ses menus).

## Contrat

Pagination **opt-in** — c'est la présence de `limit` qui l'active.

| Paramètre | Défaut | Effet |
|---|---|---|
| *(aucun)* | — | Catalogue complet, `data: []`. **Contrat historique inchangé.** |
| `limit` | — | Active la pagination. Plafonné à `MAX_LIMIT = 50`. |
| `cursor` | — | Page suivante. Sa **présence** = « pas la première page ». |
| `q` | — | Recherche par nom (`ilike`), résolue en base. |

Réponse en mode paginé :

```json
{
  "success": true,
  "data": [ /* boutiques */ ],
  "banners": [],           // vides dès qu'un `cursor` est fourni
  "appleReviewMode": false,
  "nextCursor": "MjAyNi0w…"  // null = fin de liste
}
```

Chaque boutique porte `stats: { rating, count }` — note synthétisée depuis ses
plats, plancher à 3. Voir `architecture/ratings.md`.

> ⚠️ **La rétrocompatibilité n'est pas optionnelle.** Les versions de l'app déjà
> installées appellent cette route sans paramètre et attendent un **tableau**.
> Sans `limit`, le service renvoie donc exactement l'ancienne forme — pas un
> objet `{items}`, et pas de champ `nextCursor`.

## Curseur, pas offset

Avec `?page=2`, créer une boutique décale toutes les suivantes : la page 2
renvoie alors un élément déjà affiché — ou en **saute** un définitivement. Le
curseur dit « ce qui suit CET élément-là », donc une insertion ailleurs dans la
liste ne le perturbe pas.

Le curseur encode `(created_at, id)` en base64url, opaque pour le client. `id`
est **indispensable** : deux boutiques créées à la même seconde rendraient
sinon le curseur ambigu, et l'une serait sautée.

Un curseur illisible est ignoré (retour au début) plutôt que de faire échouer
la requête.

## Tri

`created_at DESC, id DESC`.

> ⚠️ `getAll()` n'avait **aucun `ORDER BY`** : l'ordre venait de Postgres, sans
> garantie de stabilité entre deux appels. Un curseur l'exige — d'où le tri
> explicite dans `getPage()`. `getAll()` reste inchangé (d'autres appelants).

Conséquence voulue côté client : une nouvelle boutique arrive **toujours en
tête**, jamais au milieu — rien ne se décale sous les yeux de l'utilisateur.

## Boutiques sans plat

`getFastFoodsService` écarte les boutiques sans menu **après** la requête
(`.filter(f => f.menus.length > 0)`). Une page de 10 pouvait donc n'en rendre
que 2 — et, constaté en test, **0 sur une page de 2**, le home paraissant vide
alors qu'il restait des boutiques.

`getPage()` filtre donc en amont, par jointure **interne** :

```js
.select('*, menus!inner(id)')
```

Seul `id` du menu est sélectionné : il ne sert qu'à prouver l'existence.

Cette jointure rend **une ligne par menu** — une boutique de 5 plats apparaît 5
fois. Le repo lit par lots et déduplique par id **avant** de découper la page,
sinon `limit` compterait des menus au lieu de boutiques. Borne dure de 8 tours
pour ne jamais balayer la table entière.

Le curseur porte alors sur la dernière boutique **rendue**, ce qui est exact :
la jointure garantit qu'aucune ne sera écartée ensuite par le service.

## Boutiques et plats indisponibles

Exclus du home. `getPage()` filtre en base (`is_available`, `open_days <> '{}'`,
et sur la jointure `menus` : `status <> 'unavailable'`, `disponibilite <> false`)
pour garder des pages pleines ; le service refiltre (mode complet `getAll()`).
Voir [merchants.md](./merchants.md#jours-douverture--disponibilité-migration-049).

## Bannières

Servies **uniquement** quand `cursor` est absent. Les renvoyer à chaque
`loadMore` serait du poids pur : le carrousel ne se recharge pas au scroll.

## Mode volume (build de test)

Pour éprouver la fluidité du home sur un vrai volume, la **build de test**
reçoit un catalogue de `test_fastfood_volume` boutiques (500 par défaut) au lieu
des données réelles. Même route, même contrat de réponse.

- **Déclencheur** : `test_app_version` (`settings_deployment`, migration 051)
  égal au header `x-app-version` du client. Égalité stricte sur le header
  seulement : un client sans header n'est jamais la build de test. Vide = mode
  coupé pour tout le monde. Réglage générique, réutilisable par tout futur
  comportement réservé à la build de test (`isTestClient(req)`).
- **Données** : clones des boutiques réelles telles que les renvoie
  `getFastFoodsService` (prix, vignettes, notes déjà calculés), servis en
  boucle. Rien n'est écrit en base.
- **Identifiants** : `vt<rang>-<id réel>`, stables d'un appel à l'autre. Les
  plats clonés portent l'id de leur boutique clonée : une commande passée sur un
  clone échoue au lieu d'atterrir chez le vrai marchand.
- **Images** : `test_volume_image_url` (migration 052), gabarit d'URL contenant
  `{seed}`, remplacé par l'id cloné de la boutique (`image`) et de chaque plat
  (`image`, `coverImage`, `images[]`). Chaque clone a donc sa propre image,
  vraiment téléchargée : sinon les clones réutilisent les URLs réelles, déjà en
  cache, et le test ne mesure aucun chargement. Défaut : Picsum
  (`https://picsum.photos/seed/{seed}/600/400`). Vide = images réelles.
- **Curseur** : le rang de la boutique suivante, en base64url (opaque aussi).
- **Limites** : mode paginé uniquement (`limit` présent) et jamais sur une
  recherche `q`, servie par les données réelles.

Activer / couper, sans redéployer (cache `SETTINGS_CACHE_TTL_MS`) :

```sql
UPDATE settings_deployment SET value = '"1.1.1"'::jsonb WHERE key = 'test_app_version';
UPDATE settings_deployment SET value = '""'::jsonb      WHERE key = 'test_app_version';
-- Images : Picsum, ou vide pour garder les images réelles
UPDATE settings_deployment SET value = '"https://picsum.photos/seed/{seed}/600/400"'::jsonb WHERE key = 'test_volume_image_url';
UPDATE settings_deployment SET value = '""'::jsonb WHERE key = 'test_volume_image_url';
```

> ⚠️ Couper le mode (valeur vide) avant qu'une version publiée sur les stores
> porte ce numéro : ses utilisateurs verraient sinon les boutiques clonées.

## Fichiers

| Fichier | Rôle |
|---|---|
| `repositories/supabase/fastfoods.repo.js` | `getPage()` — tri, curseur, jointure, dédup. `getAll()` intact. |
| `services/fastfood/volumeTestFastFoods.js` | Mode volume : clones paginés des boutiques réelles. |
| `services/settings/settings.service.js` | `isTestClient(req)`, `getTestFastfoodVolume()`, `getTestVolumeImageUrl()`. |
| `services/fastfood/getFastFoods.js` | 2e argument optionnel ; renvoie `{items, nextCursor}` en paginé, un tableau sinon. |
| `controllers/fastfood/getFastFoods.js` | Query params, plafond `MAX_LIMIT`, bannières page 1. |

## Dette assumée

**N+1 sur les menus** : `getMenuService(id)` est appelé une fois par boutique.
La pagination le ramène de 501 à 11 requêtes par chargement, ce qui suffit. Le
corriger (`WHERE fastfood_id IN (…)`) donnerait 2 requêtes — à faire sur
mesures, pas par principe.

## Vérification

```bash
B=http://localhost:5000/fastFood/all

# 1. Rétrocompatibilité : tableau complet, bannières présentes, pas de nextCursor
curl -s "$B" | jq '{type:(.data|type), n:(.data|length), banners:(.banners|length)}'

# 2. Page pleine (une page de N doit rendre N boutiques affichables)
curl -s "$B?limit=3" | jq '{n:(.data|length), cursor:(.nextCursor!=null)}'

# 3. Bannières absentes dès la page 2
C=$(curl -s "$B?limit=2" | jq -r .nextCursor)
curl -s "$B?limit=2&cursor=$C" | jq '{banners:(.banners|length)}'

# 4. Ni trou ni doublon : l'ensemble paginé == l'ensemble complet
#    (trier avec LC_ALL=C, sinon la locale fausse la comparaison)

# 5. Tri stable : deux appels identiques rendent le même ordre
curl -s "$B?limit=3" | jq -r '[.data[].id]|join(",")'

# 6. Recherche
curl -s "$B?limit=10&q=Fried" | jq '[.data[].name]'

# 7. Plafond
curl -s "$B?limit=9999" | jq '.data|length'   # <= 50
```
