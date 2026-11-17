# Villes de livraison (table `cities`, migration 095, 17/11/2026)

Liste des villes proposées aux boutiques (création et édition, champ « Villes de
livraison ») : les 315 communes rurales du Cameroun + les 14 villes à
arrondissements regroupées (Douala, Yaoundé, Bafoussam, Bamenda, Bertoua, Ebolowa,
Edéa, Garoua, Kribi, Kumba, Limbe, Maroua, Ngaoundéré, Nkongsamba), avec les noms
historiques de l'app gardés tels quels (`Kousseri`, `Mballa`). Source : Wikipedia
« Commune (Cameroun) ». Pas de saisie libre côté app.

| Route | Auth | Effet |
|---|---|---|
| `GET /cities` | non | `data: [{ id, name, region, active }]`, actives seulement, triées par nom |
| `PATCH /cities/:id` | admin | `{ name?, region?, active? }` (`interface/cityFields.js`) |

- Les boutiques stockent le **nom** dans `fastfoods.cities` (JSONB), inchangé pour
  les anciennes apps.
- **Renommer** (`name`) : `fastfoods.repo.renameCity` remplace l'ancien nom dans
  chaque boutique qui le dessert, puis `broadcastFastfoodViews` (R24).
- **Retirer** : `active = false`, jamais de suppression. La ville n'est plus
  proposée, les boutiques qui l'ont la gardent.

Fichiers : `routes/citiesRoutes.js` → `controllers/cities/cities.controller.js` →
`services/cities/cities.service.js` → `repositories/supabase/cities.repo.js`.
