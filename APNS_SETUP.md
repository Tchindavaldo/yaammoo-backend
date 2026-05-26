# Configuration APNs (notifications push iOS) — Yaammoo

Les pushs iOS partent **directement** vers Apple APNs depuis le backend (via
`@parse/node-apn`), pas via Firebase. On utilise la même clé `.p8` que celle
créée pour ton compte Apple Developer.

> Pour les Android, on continue à utiliser Firebase Cloud Messaging (FCM) avec
> le service account Firebase déjà configuré.

## 1. App ID Apple

Sur https://developer.apple.com/account → Identifiers, l'App ID
`com.yaammoo.app` doit avoir ces capabilities cochées :
- ☑ **Sign in with Apple**
- ☑ **Push Notifications**

## 2. Clé APNs `.p8`

Tu peux réutiliser la même clé `.p8` créée pour ton autre app (les clés APNs
sont liées au **Team**, pas à l'App ID). Pas besoin d'en créer une seconde.

Place-la dans le backend :
```
yaammoo-backend/secrets/AuthKey_XXXXXXXXXX.p8
```

⚠️ Ne **jamais** commit ce fichier. Ajoute dans `.gitignore` :
```
secrets/
*.p8
```

## 3. Variables d'environnement

### Local dev (`.env` ou `.env.dev`)

```dotenv
APNS_KEY_PATH=./secrets/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=23ARWS8L89
APNS_BUNDLE_ID=com.yaammoo.app
APNS_PRODUCTION=true
```

### Production Fly.io

```bash
flyctl secrets set APNS_KEY_CONTENT="$(Get-Content -Raw secrets/AuthKey_XXXXXXXXXX.p8)"
flyctl secrets set APNS_KEY_ID=XXXXXXXXXX APNS_TEAM_ID=23ARWS8L89 APNS_BUNDLE_ID=com.yaammoo.app APNS_PRODUCTION=true
```

### Quand utiliser `APNS_PRODUCTION=true` ?

- `true` pour **TOUS** les builds EAS (development, preview, production) car
  EAS produit des builds **ad-hoc distribution** qui s'enregistrent sur les
  serveurs APNs Production
- `false` uniquement pour les builds Xcode en mode "Run" avec un provisioning
  profile de type "iOS App Development" (sandbox APNs)

Si tu mets la mauvaise valeur, Apple répond `BadDeviceToken` à tous les pushs.

## 4. Architecture

```
Frontend iOS                         Backend                      Apple
┌─────────────────┐                  ┌────────────────────┐       ┌──────┐
│ expo-           │                  │ POST /user/        │       │      │
│ notifications   │──── token APNs ──▶ push-token/add     │       │      │
│ getDevicePush   │     hex 64       │  + deviceId        │       │ APNs │
│ TokenAsync()    │                  │                    │       │      │
└─────────────────┘                  │  Stocke dans       │       │      │
                                     │  user.pushTokens[] │       │      │
                                     │                    │       │      │
Lors d'un envoi:                     │  collectUserTokens │       │      │
                                     │  → split fcm/apns  │       │      │
                                     │                    │       │      │
                                     │  apns → node-apn   │──────▶│      │
                                     │  fcm → admin.msg   │       │      │
                                     └────────────────────┘       └──────┘
```

## 5. Modèle Firestore

Un user a maintenant un champ `pushTokens` :

```js
{
  uid: "...",
  pushTokens: [
    {
      token: "a1b2c3...64hex",     // APNs hex
      platform: "ios",
      deviceId: "<uuid persistent>",
      lastSeen: "2026-05-25T20:00:00.000Z"
    },
    {
      token: "fGH3kL...",          // FCM
      platform: "android",
      deviceId: "<uuid persistent>",
      lastSeen: "..."
    }
  ]
}
```

L'ancien champ `fcmTokens: string[]` reste lu en fallback par
`collectUserTokens` pour la rétrocompatibilité avec les users qui n'ont pas
encore reconnecté. À la prochaine connexion, leurs tokens migrent dans
`pushTokens`.

## 6. Endpoints API

| Endpoint | Auth | Usage |
|---|---|---|
| `POST /user/push-token/add` | Bearer Firebase | Enregistre `{ token, platform, deviceId }` au login + après acceptation des notifs |
| `POST /user/push-token/remove` | Bearer Firebase | Désenregistre `{ deviceId }` au logout |

## 7. Tester

### Test manuel local

```bash
node -e "
require('dotenv').config({ path: '.env' });
const send = require('./src/services/notification/APNS/sendApnsPush.service');
send({
  tokens: ['VOTRE_TOKEN_APNS_HEX'],
  title: 'Test Yaammoo',
  body: 'Push iOS direct',
  data: { type: 'test' }
}).then(r => console.log(r));
"
```

Le token APNs hex peut être récupéré dans Firestore →
`users/<uid>/pushTokens[].token` après une connexion iOS.

Tu dois voir :
```
✅ [APNS] Provider initialisé (production=true, keyId=...)
📤 [APNS] Envoi vers 1 token(s) iOS
✅ [APNS] Résultat : 1 succès, 0 échecs
```

Et l'iPhone vibre avec la notif.

### Test depuis l'app

1. Build iOS : `eas build -p ios --profile development`
2. Installe sur iPhone, connecte-toi (Google ou Apple)
3. Accepte la popup "Recevoir les notifications"
4. Dans Firestore, ton user doit avoir `pushTokens[]` avec une entrée iOS
5. Déclenche un event (nouvelle commande, etc.) qui appelle `notifyOrderEvent`
6. L'iPhone reçoit la notification ✅

## 8. Que se passe-t-il si APNs échoue ?

Le service `sendApnsPush` :
- Détecte les tokens invalides (`BadDeviceToken`, `Unregistered`, `DeviceTokenNotForTopic`)
- Les renvoie via `tokensToDelete`
- `notifyOrderEvent.cleanStaleTokens` les supprime automatiquement de Firestore
  (`pushTokens` ET `fcmTokens` legacy)

Aucune intervention manuelle nécessaire.
