# Conditions d'utilisation et confidentialité (migration 077)

Texte en base, une ligne par version (`legal_documents`). Source de la v1 :
frontend `legal/conditions-et-confidentialite.md`.

| Route | Auth | Rôle |
|---|---|---|
| `GET /legal/current` | non | dernière version (texte complet) |
| `GET /legal/status` | oui | `{ latestVersion, publishedAt, acceptedVersion, acceptedAt, mustAccept }` |
| `POST /legal/accept` `{ version }` | oui | preuve d'acceptation (`legal_acceptances`, idempotent) ; 409 `legal_outdated` si ce n'est plus la dernière |

`mustAccept` : jamais accepté, ou une version `requires_acceptance = true`
plus récente que la dernière acceptée. Version mineure (`false`) : rien n'est
redemandé, l'app signale seulement la mise à jour.

Publier une version : `INSERT INTO legal_documents (version, title, content,
requires_acceptance)` avec `version` = précédente + 1.

Fichiers : `routes/legalRoutes.js`, `controllers/legal/legal.controller.js`,
`repositories/supabase/legal.repo.js`.

## Formulaire d'adhésion du Marchand (Annexe 3, migration 078)

`POST /legal/merchant-adhesion` (firebaseAuth), appelé par l'app juste après
`POST /fastFood`, case cochée : `{ fastFoodId, version, representativeRole
(gerant|directeur|proprietaire), legalName?, address }`. Le backend lit le nom
et le prénom sur le compte et le nom de la boutique en base, enregistre une
ligne `merchant_adhesions` (une par boutique et version, date posée par la base,
secteur « restauration et vente de produits alimentaires ») et l'acceptation des
CGU (`legal_acceptances`). 403 si la boutique n'est pas celle du compte,
409 `legal_outdated` si la version n'est plus la dernière.
