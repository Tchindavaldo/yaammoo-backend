-- 028_foreign_keys_PRECHECK.sql
-- LECTURE SEULE — à lancer AVANT la migration 028. Ne modifie rien.
--
-- Compte les lignes orphelines que 028 supprimera (colonnes NOT NULL) ou
-- passera à NULL (colonnes nullables). Si tout est à 0, la migration 028
-- n'effacera AUCUNE donnée.

SELECT 'fastfoods sans user (SUPPRIMÉES)'          AS cible, COUNT(*) FROM fastfoods WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orders sans user (SUPPRIMÉES)',             COUNT(*) FROM orders WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orders sans fastfood (SUPPRIMÉES)',         COUNT(*) FROM orders WHERE fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'rank_counters sans fastfood (SUPPRIMÉES)',  COUNT(*) FROM rank_counters WHERE fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'transactions sans user (SUPPRIMÉES)',       COUNT(*) FROM transactions WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'bonus_requests sans user (SUPPRIMÉES)',     COUNT(*) FROM bonus_requests WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'bonus_requests sans bonus (SUPPRIMÉES)',    COUNT(*) FROM bonus_requests WHERE bonus_id NOT IN (SELECT id FROM bonus)
UNION ALL
SELECT 'driver_applications sans user (SUPPR.)',    COUNT(*) FROM driver_applications WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'driver_applications sans fastfood (SUPPR.)',COUNT(*) FROM driver_applications WHERE fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'order_deliveries sans user (SUPPRIMÉES)',   COUNT(*) FROM order_deliveries WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'order_settlements sans user (SUPPRIMÉES)',  COUNT(*) FROM order_settlements WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
-- Ci-dessous : mises à NULL, aucune ligne perdue.
SELECT 'users.fastfood_id -> NULL',                 COUNT(*) FROM users WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'orders.menu_id -> NULL',                    COUNT(*) FROM orders WHERE menu_id IS NOT NULL AND menu_id NOT IN (SELECT id FROM menus)
UNION ALL
SELECT 'orders.driver_id -> NULL',                  COUNT(*) FROM orders WHERE driver_id IS NOT NULL AND driver_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'notifications.user_id -> NULL',             COUNT(*) FROM notifications WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'notifications.fastfood_id -> NULL',         COUNT(*) FROM notifications WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'order_deliveries.fastfood_id -> NULL',      COUNT(*) FROM order_deliveries WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'order_deliveries.bonus_id -> NULL',         COUNT(*) FROM order_deliveries WHERE bonus_id IS NOT NULL AND bonus_id NOT IN (SELECT id FROM bonus)
UNION ALL
SELECT 'order_settlements.fastfood_id -> NULL',     COUNT(*) FROM order_settlements WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods)
UNION ALL
SELECT 'platform_revenues.user_id -> NULL',         COUNT(*) FROM platform_revenues WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'platform_revenues.fastfood_id -> NULL',     COUNT(*) FROM platform_revenues WHERE fastfood_id IS NOT NULL AND fastfood_id NOT IN (SELECT id FROM fastfoods)
ORDER BY 2 DESC;
