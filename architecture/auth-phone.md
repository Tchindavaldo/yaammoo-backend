# Auth par numéro de téléphone (Bird) — Backend

Authentification sans mot de passe : l'utilisateur saisit son numéro, reçoit un
code à 6 chiffres (WhatsApp en priorité, repli SMS), et obtient un **custom token
Firebase** qu'il échange contre une session persistante.

Portage de l'implémentation MoobilPay, adaptée à yaammoo : **Supabase** au lieu de
Firestore, `fetch` natif au lieu d'axios, réglages en base au lieu de `.env`.

---

## Routes (`/auth`)

| Méthode | Path                              | Controller                          | Description                                   |
| ------- | --------------------------------- | ----------------------------------- | --------------------------------------------- |
| POST    | `/auth/phone/request`             | `requestPhoneAuthController`        | Envoie le code OTP (facturé par Bird)         |
| POST    | `/auth/phone/verify`              | `verifyPhoneAuthController`         | Valide le code → connexion ou inscription     |
| GET     | `/auth/phone/costs/summary`       | `getOtpCostSummaryController`       | Récapitulatif des dépenses Bird               |
| GET     | `/auth/phone/verification/:id`    | `getVerificationDetailsController`  | **Diagnostic** — pourquoi un code n'arrive pas |

---

## Flux complet

### Étape 1 — `POST /auth/phone/request`

```json
{ "phoneNumber": "698087460" }
```

1. Lecture des réglages OTP (`settings_auth`).
2. Normalisation E.164 : `698087460` → `+237698087460` (indicatif depuis
   `otp_default_country_code`).
3. **Contrôle du cooldown AVANT l'appel Bird** — passé ce point, l'envoi est
   facturé. Si trop rapproché : `429` + en-tête `Retry-After`.
4. `POST /v1/verify/verifications` chez Bird. Bird choisit le canal selon le pays,
   génère le code, gère expiration et tentatives.
5. Trace locale dans `phone_otp` (verification_id, jamais le code).
6. Trace du coût dans `bird_costs` (montant encore `null`).

Réponse : `{ verificationId, phoneNumber, expiresIn }`.

> La réponse est **identique que le numéro soit inscrit ou non** — sinon
> l'endpoint deviendrait un outil d'énumération des comptes.

### Étape 2 — `POST /auth/phone/verify`

```json
{ "phoneNumber": "698087460", "code": "123456", "nom": "…", "prenom": "…" }
```

1. Relecture du `verificationId` **avant** vérification (une vérification réussie
   supprime la trace, et l'id reste nécessaire pour lire le coût).
2. `POST /v1/verify/verifications/check` chez Bird.
3. Lecture du coût réel (`GET /v1/verify/verifications/{id}`) → `bird_costs`.
4. Recherche du compte par numéro, **toutes formes confondues** (voir plus bas).
5. Inconnu → création Firebase Auth (`uid = ph_<numero>`) + ligne `users`.
   Connu → mise à jour `phoneVerified` / `lastLoginAt`, profil non écrasé.
6. `admin.auth().createCustomToken(uid, { authProvider: 'phone' })`.

Réponse : `{ success, message, customToken, isNewUser, user, cost }`.

**Codes HTTP** : `200` succès · `400` paramètre manquant · `401` code refusé
(`reason`, `attemptsRemaining`) · `429` cooldown.

### Forme des réponses : À PLAT, pas sous `data`

Les deux endpoints étalent les champs du résultat **à la racine** de la réponse :

```json
{ "success": true, "message": "Compte créé", "isNewUser": true, "customToken": "…", "user": {} }
```

C'est la convention déjà suivie par les autres routes de compte
(`userController.addPushToken` : `res.json({ success: true, ...result })`), et donc
ce que lit le frontend (`whatsappAuthService.ts` → `data.customToken`).

Le service interne, lui, retourne `{ success, message, data: {…} }` : le controller
applique un helper `flatten()` à la sortie. Ne pas retirer ce helper — imbriquer
sous `data` obligerait l'appelant à écrire `response.data.data.customToken`, et
produit sinon un `customToken: undefined` **silencieux** : la requête réussit en
`200`, et l'erreur ne surgit qu'au `signInWithCustomToken()` sous la forme
trompeuse `auth/internal-error`.

### Côté frontend

`customToken` **n'est pas un token d'accès** : il est à usage unique, valable 1 h,
et ne fonctionne pas dans un en-tête `Authorization`.

```js
await signInWithCustomToken(auth, customToken); // → refresh token persistant
const idToken = await auth.currentUser.getIdToken(); // → Authorization: Bearer
```

La session survit bien au-delà de six mois sans nouvelle saisie de code.

---

## Recherche du compte : les deux formes du numéro

`users.numero` est un **BIGINT sans `+`**. Les comptes créés par le parcours
e-mail portent le numéro **local** saisi (`698087460`), tandis que l'auth
téléphone normalise en **E.164** (`237698087460`).

Chercher une seule forme créerait un **doublon de compte** pour un utilisateur
déjà inscrit. `repos.users.getUserByAnyPhone([...])` interroge donc les deux, et
retient la ligne la plus ancienne (le compte d'origine).

`phoneVariants(e164, countryCode)` (`utils/validator/validatePhoneNumber.js`)
produit la liste.

> Le compte retrouvé garde **son `uid` d'origine** (inscription e-mail ou Google) :
> c'est lui qui porte la session Firebase, pas le `ph_…` dérivé du numéro.

---

## Le code OTP n'est jamais stocké

Bird génère le code, le valide, gère son expiration et le nombre de tentatives.
yaammoo ne conserve que le `verification_id` — nécessaire au contrôle et à la
lecture du coût. Aucune table ne contient de code.

---

## Coûts Bird

Bird **n'expose aucune vue agrégée** : le coût se lit vérification par
vérification. Sans trace locale, la dépense est invisible.

| Moment            | Écriture dans `bird_costs`                                  |
| ----------------- | ----------------------------------------------------------- |
| Envoi             | Ligne créée, `total_cost = NULL` (Bird ne l'a pas résolu)   |
| Renvoi            | `send_count` incrémenté (Bird réutilise l'id mais facture)  |
| Vérification      | `total_cost`, `attempts[]`, `delivered_channel` complétés   |
| Consultation      | Les lignes restées `NULL` sont résolues à la volée          |

Une demande **abandonnée** (code jamais saisi) est facturée : elle reste visible
en `pending` puis bascule en `abandoned`, au lieu de disparaître du total.

`GET /auth/phone/costs/summary?from=…&to=…` →
`{ count, verified, abandoned, pending, totalCost, currencyCode, byChannel }`.
La résolution des coûts manquants s'y fait par des **lectures** (gratuites,
aucun envoi), ce qui évite d'avoir à planifier un job.

### `byChannel` — WhatsApp et SMS y figurent tous les deux

Ce ne sont pas deux fonctionnalités : Bird envoie l'OTP **en WhatsApp d'abord, en
SMS si la livraison échoue**. Une même vérification peut donc porter deux
tentatives, chacune facturée. `attempts[]` en garde le détail, et `byChannel`
ventile la dépense par canal réellement tenté.

> **Périmètre : uniquement l'OTP.** L'envoi de SMS autonomes (hors parcours
> d'authentification) n'est pas porté depuis MoobilPay — pas de `sendSmsTemplate`,
> pas de `getSmsStatus`, pas de `recordSmsSent`. Chaque ligne de `bird_costs` est
> une vérification.

---

## Configuration

### Secret — variable d'environnement

| Variable        | Rôle                                              |
| --------------- | ------------------------------------------------- |
| `BIRD_API_KEY`  | Clé `bk_{region}_…`. Région et URL en sont déduites |
| `BIRD_REGION`   | Optionnel, surcharge la région déduite            |
| `BIRD_API_URL`  | Optionnel, si Bird change de domaine              |

En production : `flyctl secrets set -a yaammoo-backend BIRD_API_KEY=…`, puis
`flyctl deploy` (un `secrets set` seul ne déploie pas le code — cf. R11).

### Réglages — table `settings_auth`

Modifiables à chaud via `PATCH /settings/:key` (admin), sans redéploiement.

| Clé                           | Défaut  | Rôle                                                    |
| ----------------------------- | ------- | ------------------------------------------------------- |
| `otp_resend_cooldown_seconds` | `60`    | Délai minimum entre deux demandes pour un même numéro   |
| `otp_expires_in_seconds`      | `600`   | Durée annoncée au frontend (Bird gère l'expiration réelle) |
| `otp_default_country_code`    | `"237"` | Indicatif ajouté aux numéros sans préfixe               |
| `otp_bird_timeout_ms`         | `15000` | Timeout des appels HTTP vers Bird                       |

> Le **cooldown** est le levier direct sur la facture : chaque envoi est payant,
> et sans ce verrou un « renvoyer » cliqué en rafale se facture autant de fois.
> Il doit pouvoir se durcir en pleine journée — d'où la base plutôt que `.env`.

---

## Tables (migration 045)

### `phone_otp`

Une ligne par numéro ; une nouvelle demande écrase la précédente. `created_at`
porte le verrou anti-renvoi.

| Colonne           | Rôle                                |
| ----------------- | ----------------------------------- |
| `phone_number`    | PK, E.164                           |
| `verification_id` | Identifiant Bird                    |
| `status`          | `pending` par défaut                |
| `created_at`      | Base du calcul du cooldown          |

### `bird_costs`

| Colonne                                  | Rôle                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| `id`                                     | PK — `verification_id`                                  |
| `phone_number`                           | Destinataire, en E.164                                  |
| `total_cost` / `currency_code`           | `NULL` tant que Bird n'a pas résolu                     |
| `attempts` (JSONB)                       | Une entrée par canal tenté (WhatsApp, puis SMS), son coût |
| `delivered_channel`                      | Canal ayant effectivement livré                         |
| `send_count`                             | Renvois sur le même id                                  |
| `verified`                               | Le code a-t-il fini par être validé                     |
| `user_id`                                | Toujours `NULL` sur ce parcours — voir ci-dessous       |

> `user_id` n'est jamais renseigné : au moment de l'envoi on ne sait pas encore
> qui c'est, et la ligne n'est pas complétée après vérification. Pour rattacher
> une dépense à un compte, il faut passer par `phone_number` — en tenant compte
> des deux formes du numéro (cf. plus haut).

---

## Structure des fichiers

```
config/bird.js                              # SECRET + région/URL uniquement

services/notification/bird/
├── birdClient.js                           # fetch natif, Bearer, timeout depuis settings
├── sendOtp.service.js                      # POST /v1/verify/verifications
├── verifyOtp.service.js                    # POST /v1/verify/verifications/check
├── getVerification.service.js              # GET  /v1/verify/verifications/{id} (diagnostic + coût)
└── birdCost.service.js                     # journal des dépenses, récapitulatif

services/auth/phoneAuth.service.js          # orchestration : cooldown, compte, custom token
controllers/auth/phoneAuth.controller.js
routes/authRoutes.js                        # /auth/phone/*
interface/phoneAuthFields.js                # payloads déclarés (R3)
utils/validator/validatePhoneNumber.js      # normalizePhoneNumber, phoneToNumero, phoneVariants

repositories/supabase/phoneOtp.repo.js
repositories/supabase/birdCosts.repo.js
```

**Pas d'axios** dans ce backend : `birdClient` s'appuie sur le `fetch` natif de
Node 18+, avec `AbortController` pour le timeout.

---

## Diagnostic : le code n'arrive pas

`getVerificationDetails({ verificationId })` retourne le détail complet — une
entrée par canal tenté, avec `deliveryStatus` et `error`. C'est là qu'apparaît la
cause exacte : solde insuffisant, pays non couvert, numéro invalide.

Les canaux actifs par pays se règlent dans le dashboard Bird : **Verify → Countries**.

---

## Points d'attention

1. **Bird répond `200` même pour un code refusé** — le verdict est dans
   `data.success`, et l'état sous `data.verification` (pas à la racine).
2. **Le cooldown se contrôle avant l'appel Bird**, jamais après : après, c'est
   déjà facturé.
3. **En cas d'échec de lecture du cooldown, l'envoi est autorisé** : mieux vaut un
   SMS de trop qu'un utilisateur bloqué.
4. **Le suivi des coûts ne fait jamais échouer un envoi** — les erreurs y sont
   journalisées, pas propagées.
