-- ============================================================================
-- 063_pawapay_fees.sql
-- ============================================================================
-- Frais de paiement NOMMÉS PAR AGRÉGATEUR. Chaque agrégateur garde ses propres
-- clés : passer de l'un à l'autre (env `PAYMENT_AGGREGATOR`) ne touche jamais
-- au barème de l'autre.
--
-- DigiKUNTZ : `payment_fee_percent` (5 %) reste tel quel. C'est un taux TOUT
--   COMPRIS : la commission MobileWallet y est déjà incluse, c'est pourquoi
--   aucune clé de commission MW séparée n'existe pour lui. C'était déjà le
--   fonctionnement avant pawaPay ; on ne le renomme pas pour ne rien casser.
--
-- pawaPay : trois frais distincts, chacun calculé sur le montant PAYÉ P et
--   arrondi à l'excès SÉPARÉMENT (comme MobileWallet, core/fees.py) :
--     - dépôt pawaPay, par réseau (MTN 1,75 % / Orange 1,77 %) ;
--     - commission MobileWallet (0,1 %) ;
--     - réserve de retrait prépayée, par réseau (MTN 1,3 % / Orange 1 %) :
--       MobileWallet la prélève AU DÉPÔT pour payer plus tard le virement vers
--       le même réseau (retrait même réseau = 0 F pour le marchand).
--
-- Les frais de retrait opérateur (`withdrawal_fee_*`, 54 F / 1,2 % + 4) ne
-- bougent pas : ils couvrent le retrait du marchand au kiosque, quel que soit
-- l'agrégateur.
--
-- Idempotente : rejouable sans effet de bord.
-- ============================================================================

INSERT INTO settings_pricing (key, value, description) VALUES
  ('pawapay_deposit_fee_mtn_percent',
   '1.75'::jsonb,
   'pawaPay — frais de DÉPÔT MTN, en % du montant payé. Arrondi à l''entier SUPÉRIEUR, séparément des autres frais.'),
  ('pawapay_deposit_fee_orange_percent',
   '1.77'::jsonb,
   'pawaPay — frais de DÉPÔT Orange, en % du montant payé. Arrondi à l''entier SUPÉRIEUR, séparément des autres frais.'),
  ('pawapay_mw_commission_percent',
   '0.1'::jsonb,
   'pawaPay — commission MobileWallet, en % du montant payé. Arrondie à l''entier SUPÉRIEUR, séparément des autres frais.'),
  ('pawapay_payout_fee_mtn_percent',
   '1.3'::jsonb,
   'pawaPay — réserve de RETRAIT MTN prépayée au dépôt, en % du montant payé. Sert aussi de taux interréseau quand le marchand retire VERS MTN depuis son solde Orange.'),
  ('pawapay_payout_fee_orange_percent',
   '1.0'::jsonb,
   'pawaPay — réserve de RETRAIT Orange prépayée au dépôt, en % du montant payé. Sert aussi de taux interréseau quand le marchand retire VERS Orange depuis son solde MTN.')
ON CONFLICT (key) DO NOTHING;

-- DigiKUNTZ : description précisée, valeur inchangée.
UPDATE settings_pricing
   SET description = 'DigiKUNTZ — frais du prestataire de paiement, en % du montant payé, TOUT COMPRIS (commission MobileWallet incluse, d''où l''absence de clé séparée). Arrondi à l''entier SUPÉRIEUR. Ne revient pas à la plateforme.'
 WHERE key = 'payment_fee_percent';
