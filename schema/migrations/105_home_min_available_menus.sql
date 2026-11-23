-- 105 — Minimum de plats disponibles pour paraître au home (settings_app)
-- Une boutique avec moins de N plats disponibles est absente du home et de la
-- recherche (son propriétaire la voit toujours). 0 = aucun minimum.
-- Idempotente. Ordre de déploiement indifférent (repli code = 3).
INSERT INTO settings_app (key, value, description) VALUES
  ('home_min_available_menus', '3'::jsonb, 'Plats disponibles minimum pour qu''une boutique paraisse au home et a la recherche (le proprietaire la voit toujours). 0 = aucun minimum.')
ON CONFLICT (key) DO NOTHING;
