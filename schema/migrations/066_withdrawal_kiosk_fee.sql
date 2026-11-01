-- 066 — Frais de retrait kiosque d'un retrait portefeuille.
-- `amount` = montant ENVOYÉ au téléphone (espèces voulues + frais kiosque) ;
-- `kiosk_fee` = la part qui couvre le retrait en espèces chez l'agent.
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS kiosk_fee NUMERIC NOT NULL DEFAULT 0;
