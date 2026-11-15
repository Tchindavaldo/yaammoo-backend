-- 083 : frais des codes SMS de validation des numeros de retrait (CGU 12.5 bis).
-- Chaque code envoye par SMS pour verifier un numero Orange Money / MTN est
-- debite au marchand, au COUT REEL Bird (USD) converti en FCFA au taux du jour.
ALTER TABLE bird_costs
  ADD COLUMN IF NOT EXISTS fee_purpose     TEXT,              -- 'payout_number' = facture au marchand
  ADD COLUMN IF NOT EXISTS fee_network     TEXT,              -- 'orange' | 'mtn' : solde debite
  ADD COLUMN IF NOT EXISTS fee_debited_usd NUMERIC(12, 4) DEFAULT 0,  -- part du cout deja debitee
  ADD COLUMN IF NOT EXISTS fee_debited_xaf INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_bird_costs_fee_purpose ON bird_costs(fee_purpose) WHERE fee_purpose IS NOT NULL;
-- Taux USD -> XAF : ecrit par smsFeeJob (service de change public, 1x/jour),
-- cle settings_app 'usd_xaf_rate' = { "rate": <nombre>, "fetchedAt": <iso> }.
