-- 086 : versement automatique de la part du marchand quand une commande d'une
-- boutique WhatsApp est livrée (validation par QR, services/wallet/orderPayout.service.js).
-- Une ligne `withdrawals` de kind 'order' porte l'id de la commande : un seul
-- versement non échoué par commande (un versement échoué peut être relancé).
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS order_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_order_payout_uniq
  ON withdrawals (order_id) WHERE order_id IS NOT NULL AND status <> 'failed';
