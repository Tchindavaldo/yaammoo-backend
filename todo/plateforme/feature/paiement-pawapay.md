# Paiement : passage de DigiKUNTZ à pawaPay (via MobileWallet)

- [ ] Plan VALIDÉ par l'utilisateur, code PAS encore commencé.
  - Bloquant : accès à la base yaammoo par le connecteur Supabase. L'organisation
    « yaammoo » a été autorisée le 31/10, à vérifier en début de session : il existe
    DEUX organisations nommées « yaammoo », le projet attendu est `xaocrcxnueqxnyfqaayf`.
  - Le connecteur Supabase ne couvre qu'UNE organisation par autorisation (limite Supabase).

## Branches

- backend : `feature/pawapay-payment` (créée depuis `main`)
- frontend : `feature/aeration-natif` (contient déjà `claude/drinks-variable-prices-jktlms`, fusion faite)

## État des lieux (constaté dans le code)

- `/pay` (`mobilewalletService.pay`) n'envoie pas `aggregator` : MobileWallet prend `digikuntz`
  par défaut. Réponse, webhook et socket `transaction.update` ont la même forme pour pawaPay.
- `/payout` n'envoie ni `aggregator` ni `source_network` : MobileWallet répond 422
  `source_network_required`. Les retraits sont cassés.
- `payment_number` n'existe plus dans la réponse MobileWallet ; il y a `ussd_code`.
- Front : envoie déjà `Orangemoney` / `MTN` (paiement) et `ORANGEMONEY` / `MTN` (retrait).
  Il n'affiche que le `message` des erreurs (lit `error.response.data`, jamais le code HTTP).
- MobileWallet, app Yaammoo (app_id 1) : aucune transaction pawaPay ; 154 F restants chez DigiKUNTZ.

## Frais pawaPay (base MobileWallet : `aggregators`, `aggregator_fee_rates` ; calcul `core/fees.py`)

Sur un dépôt brut P, chaque frais est calculé sur P et arrondi à l'excès séparément :

| Frais                          | MTN    | Orange |
| ------------------------------ | ------ | ------ |
| dépôt                          | 1,75 % | 1,77 % |
| commission MobileWallet        | 0,1 %  | 0,1 %  |
| retrait prépayé (réserve)      | 1,3 %  | 1 %    |
| **total**                      | 3,15 % | 2,87 % |

Retrait vers le même réseau : 0 F. Interréseau : ceil(taux de retrait du réseau de
destination x montant), pris sur le solde source.

## Décisions de l'utilisateur

1. **Paiement** : `aggregator=pawapay` (env `MOBILEWALLET_AGGREGATOR`) + `description`
   « Achat Yaammoo » (libellé de la demande PIN) sur `/pay`.
2. **Prix affiché** = base + frais pawaPay (dépôt + commission MobileWallet + retrait, chacun
   arrondi à l'excès), calculé sur le réseau le plus cher (MTN) : le réseau n'est pas connu à
   l'affichage. Remplace le barème DigiKUNTZ (`payment_fee_percent` 5 %, `withdrawal_fee_*`
   54 F / 1,2 % + 4).
3. **Taux en base yaammoo**, table `settings`, clés dédiées pawaPay modifiables à chaud
   (`PATCH /settings/:key`) : `pawapay_deposit_fee_mtn`, `pawapay_deposit_fee_orange`,
   `pawapay_mw_commission`, `pawapay_withdrawal_fee_mtn`, `pawapay_withdrawal_fee_orange`.
   Ce sont des copies des taux MobileWallet : mettre à jour les deux si pawaPay change.
4. **Portefeuille scindé** marchand / livreur : deux soldes, MTN et Orange.
   - Chaque crédit enregistre son agrégateur ET son réseau (migration).
   - Seuls les montants pawaPay sont affichés. Rien de DigiKUNTZ : ni affiché ni retirable,
     conservé en base.
   - Aucun nom d'agrégateur visible par l'utilisateur.
   - `GET /wallet/balance` : ajouter `mtn` / `orange`, garder `balance` (R11).
5. **Retrait** : l'utilisateur choisit le solde débité (MTN ou Orange) ET le numéro qui reçoit.
   Pas de repli automatique sur l'autre solde.
   - Détection du réseau en temps réel à la saisie : relais backend vers MobileWallet
     `POST /operators/predict` (la clé reste côté serveur).
   - Frais affichés avant confirmation : relais vers MobileWallet `GET /payout/quote`.
   - `/payout` envoie `aggregator` + `source_network`.
6. **Erreurs** : propager le vrai code HTTP MobileWallet (422 / 400) au lieu de 502. Le front
   continue d'afficher seulement `message`. Remplacer `payment_number` par `ussd_code`.
7. **Front** (`feature/aeration-natif`) : wallet à deux soldes + nouveau parcours de retrait
   (solde, puis numéro avec réseau détecté, puis frais, puis confirmation). Respecter R16, R18, R19.
8. **Docs** : backend `payment.md`, `wallet.md`, `pricing-fees.md`, `pricing.md` ; front
   `payment.md` + doc du wallet.

## Hors paiement (demandé dans la même session)

- [ ] Keep-alive Supabase (`src/utils/supabaseKeepAlive.js`) : ajouter le projet Rauval.
  - Soit les variables Fly `KEEPALIVE_RAUVAL_SUPABASE_URL` / `_KEY`, soit une liste lue dans
    `settings` (URL + clé publique) : proposé, pas tranché.
  - Il manque l'URL et la clé du projet Rauval (organisation non autorisée sur le connecteur).
