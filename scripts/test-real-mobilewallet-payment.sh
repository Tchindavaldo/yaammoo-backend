#!/bin/bash

##############################################
# Test Réel: Paiement via MobileWallet
# Appelle le vrai endpoint /transaction
# qui va initier un paiement MobileWallet
##############################################

set -e

# Config
API_URL="${API_URL:-http://localhost:5000}"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Réel: Paiement MobileWallet${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "API: ${YELLOW}${API_URL}${NC}"
echo ""

# Données de test
USER_ID="test-user-$(date +%s)"
MERCHANT_ID="test-merchant-$(date +%s)"
PHONE="237674123456"  # Numéro test Cameroun
NETWORK="Orangemoney"
EMAIL="test@yaammoo.local"
AMOUNT=5000

echo -e "${BLUE}[1] POST /transaction - Initier un paiement MobileWallet${NC}"
echo ""

PAYLOAD=$(cat <<EOF
{
  "userId": "${MERCHANT_ID}",
  "amount": ${AMOUNT},
  "phone": "${PHONE}",
  "network": "${NETWORK}",
  "email": "${EMAIL}",
  "payBy": "mobilemoney",
  "type": "payment",
  "name": "Paiement test ${AMOUNT} XAF"
}
EOF
)

echo -e "${YELLOW}Payload:${NC}"
echo "$PAYLOAD" | jq .
echo ""

echo -e "${YELLOW}Envoi vers ${API_URL}/transaction...${NC}"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${API_URL}/transaction" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo -e "${YELLOW}Réponse HTTP ${HTTP_CODE}:${NC}"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Paiement initié avec succès!${NC}"

  # Extraire l'info
  MW_TX_ID=$(echo "$BODY" | jq -r '.mw_transaction_id // .data.mw_transaction_id // empty' 2>/dev/null)
  STATUS=$(echo "$BODY" | jq -r '.status // .data.status // empty' 2>/dev/null)
  MESSAGE=$(echo "$BODY" | jq -r '.message // empty' 2>/dev/null)

  echo ""
  echo -e "${YELLOW}Détails:${NC}"
  echo "  Status MobileWallet: ${STATUS}"
  echo "  Transaction ID: ${MW_TX_ID}"
  echo "  Message: ${MESSAGE}"

else
  echo -e "${RED}❌ Erreur HTTP ${HTTP_CODE}${NC}"
  echo "Réponse brute:"
  echo "$BODY"
  exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Données envoyées:${NC}"
echo "  User ID: ${USER_ID}"
echo "  Merchant ID: ${MERCHANT_ID}"
echo "  Phone: ${PHONE}"
echo "  Network: ${NETWORK}"
echo "  Amount: ${AMOUNT} XAF"
echo ""
echo -e "${YELLOW}À vérifier dans les logs du backend:${NC}"
echo "  [Transaction] → Création transaction"
echo "  [Transaction] → Appel MobileWallet /pay"
echo "  [MobileWallet API] Orangemoney amount=${AMOUNT}"
echo "  [MobileWallet API] ✓ HTTP 200 reçu"
echo "  [MobileWallet Socket] Début de connexion à MobileWallet"
echo ""
echo -e "${YELLOW}Prochaines étapes:${NC}"
echo "  1. Regarder les logs du backend pour confirmer l'appel MobileWallet"
echo "  2. Attendre le verdict de MobileWallet (via Socket.io ou Webhook)"
echo "  3. Vérifier l'émission Socket 'payment.settled' vers l'utilisateur"
echo ""
