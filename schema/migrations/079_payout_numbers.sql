-- 079 : numéros de retrait (Orange Money / MTN MoMo) vérifiés par code SMS.
-- Un retrait n'est accepté que vers un numéro vérifié par le même compte.
CREATE TABLE IF NOT EXISTS payout_numbers (
  user_id      TEXT NOT NULL,
  phone_number TEXT NOT NULL,            -- E.164, ex. +237698087460
  verified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phone_number)
);
ALTER TABLE payout_numbers ENABLE ROW LEVEL SECURITY;
