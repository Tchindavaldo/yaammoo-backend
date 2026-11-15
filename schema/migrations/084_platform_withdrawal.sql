-- 084 : retrait de la part plateforme par un admin (POST /wallet/admin/platform-withdraw).
-- Une demande de retrait porte un `kind` : 'wallet' (marchand / livreur, existant)
-- ou 'platform' (admin, part de la plateforme). Au succès du payout, un retrait
-- 'platform' écrit une transaction `platform_withdrawal` (jamais `withdrawal`) :
-- il ne touche aucun portefeuille, il baisse la part disponible de la plateforme.
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'wallet';
CREATE INDEX IF NOT EXISTS withdrawals_kind_status_idx ON withdrawals (kind, status);
