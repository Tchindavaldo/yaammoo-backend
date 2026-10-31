-- ============================================================================
-- 064_wallet_aggregator_network.sql
-- ============================================================================
-- Portefeuille marchand / livreur scindé par RÉSEAU (MTN / Orange) et rattaché
-- à l'AGRÉGATEUR qui a encaissé l'argent.
--
-- Pourquoi : chez pawaPay, MobileWallet tient un solde PAR réseau. Un retrait
-- débite un solde précis (`source_network`) : même réseau que le numéro de
-- réception = 0 F de frais ; autre réseau = frais interréseau. Le portefeuille
-- yaammoo doit donc savoir, pour chaque crédit, sur quel réseau il a été payé.
--
-- Seuls les montants pawaPay sont affichés et retirables. L'historique
-- DigiKUNTZ est CONSERVÉ en base (marqué `digikuntz`), jamais supprimé.
--
-- Colonnes :
--   transactions.aggregator         'pawapay' | 'digikuntz' | NULL (hors wallet)
--   transactions.network            'MTN' | 'ORANGEMONEY' — réseau du solde touché
--   transactions.mw_transaction_id  paiement MobileWallet d'origine (crédit)
--   withdrawals.aggregator          agrégateur du payout
--   withdrawals.source_network      solde débité ('MTN' | 'ORANGEMONEY')
--   withdrawals.fee                 frais interréseau (0 si même réseau)
--   pending_payments.aggregator     agrégateur utilisé pour CE paiement
--
-- Idempotente : rejouable sans effet de bord.
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS aggregator        TEXT,
  ADD COLUMN IF NOT EXISTS network           TEXT,
  ADD COLUMN IF NOT EXISTS mw_transaction_id TEXT;

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS aggregator     TEXT,
  ADD COLUMN IF NOT EXISTS source_network TEXT,
  ADD COLUMN IF NOT EXISTS fee            NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE pending_payments
  ADD COLUMN IF NOT EXISTS aggregator TEXT;

-- Solde par réseau : lu à chaque ouverture du wallet.
CREATE INDEX IF NOT EXISTS idx_transactions_wallet
  ON transactions (user_id, aggregator, network)
  WHERE type IN ('merchant_credit', 'driver_credit', 'withdrawal');

-- ── Backfill : tout l'existant vient de DigiKUNTZ ─────────────────────────
-- Aucun paiement pawaPay n'a encore eu lieu pour l'app Yaammoo : tout crédit
-- ou retrait déjà en base est DigiKUNTZ. Le réseau reste NULL — il n'a jamais
-- été enregistré et ne peut pas être reconstitué.
UPDATE transactions
   SET aggregator = 'digikuntz'
 WHERE aggregator IS NULL
   AND type IN ('merchant_credit', 'driver_credit', 'withdrawal');

UPDATE withdrawals
   SET aggregator = 'digikuntz'
 WHERE aggregator IS NULL;

UPDATE pending_payments
   SET aggregator = 'digikuntz'
 WHERE aggregator IS NULL;
