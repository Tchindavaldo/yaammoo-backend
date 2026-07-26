# Sockets armement / desarmement bonus

Room : `<userId>`

| Event | Quand |
|---|---|
| `bonus.armed` | armement |
| `bonus.disarmed` | desarmement |

## bonus.armed

```json
{
  "data": {
    "bonusId": "7Rug4Io7ZbJ5LhZ5i864",
    "armed": true,
    "disarmedBonusIds": [],
    "deliveryOffer": {
      "active": true,
      "reason": "bonus",
      "coveredBy": "platform",
      "bonusId": "7Rug4Io7ZbJ5LhZ5i864",
      "bonusCode": "YAM-4NXBGW9S",
      "bonusName": "3 Livraison gratuit offert",
      "fastFoodId": null
    }
  }
}
```

## bonus.disarmed

```json
{
  "data": {
    "bonusId": "7Rug4Io7ZbJ5LhZ5i864",
    "armed": false,
    "disarmedBonusIds": [],
    "deliveryOffer": null
  }
}
```
