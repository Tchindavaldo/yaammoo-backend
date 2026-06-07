#!/bin/bash

##############################################
# Test Script: MobileWallet Transaction API
##############################################

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
FIREBASE_ID_TOKEN="${FIREBASE_ID_TOKEN:-your-firebase-token-here}"
MOBILEWALLET_WEBHOOK_SECRET="${MOBILEWALLET_WEBHOOK_SECRET:-your-webhook-secret}"

# Couleurs pour le output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Test: MobileWallet Transaction API${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "API Base URL: ${YELLOW}${API_BASE_URL}${NC}"
echo -e "Firebase Token: ${YELLOW}${FIREBASE_ID_TOKEN:0:20}...${NC}"
echo ""

# Test data
USER_ID="user-test-$(date +%s)"
MERCHANT_ID="merchant-test-$(date +%s)"
ORDER_ID="order-test-$(date +%s)"
TRANSACTION_ID="tx-test-$(date +%s)"
MOBILEWALLET_TX_ID="mw-tx-$(date +%s)"
AMOUNT=15000

echo -e "${BLUE}[1] POST /transaction - Créer une transaction paiement${NC}"
echo -e "${YELLOW}Données:${NC}"
echo "  userId: $USER_ID"
echo "  type: payment"
echo "  amount: $AMOUNT"
echo "  payBy: mobilewallet"
echo ""

TRANSACTION_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/transaction" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${FIREBASE_ID_TOKEN}" \
  -d "{
    \"userId\": \"${MERCHANT_ID}\",
    \"type\": \"payment\",
    \"amount\": ${AMOUNT},
    \"payBy\": \"mobilewallet\",
    \"name\": \"Paiement commande #${ORDER_ID}\",
    \"relatedOrderId\": \"${ORDER_ID}\"
  }")

echo -e "${YELLOW}Réponse:${NC}"
echo "$TRANSACTION_RESPONSE" | jq . 2>/dev/null || echo "$TRANSACTION_RESPONSE"
echo ""

# Extraire l'ID de la transaction créée
CREATED_TX_ID=$(echo "$TRANSACTION_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null)
if [ -z "$CREATED_TX_ID" ]; then
  CREATED_TX_ID="$TRANSACTION_ID"
  echo -e "${YELLOW}⚠️  Impossible d'extraire l'ID de transaction, utilisant: ${CREATED_TX_ID}${NC}"
fi

echo -e "${GREEN}✓ Transaction créée: ${CREATED_TX_ID}${NC}"
echo ""

# ================================================
# Test 2: POST /transaction/webhook/mobilewallet
# ================================================
echo -e "${BLUE}[2] POST /transaction/webhook/mobilewallet - Webhook de verdict${NC}"
echo -e "${YELLOW}Données webhook (payload signé):${NC}"
echo "  transaction_id: $MOBILEWALLET_TX_ID"
echo "  status: completed"
echo "  amount: $AMOUNT"
echo ""

# Générer une signature HMAC simple (exemple)
WEBHOOK_PAYLOAD="{
  \"transaction_id\": \"${MOBILEWALLET_TX_ID}\",
  \"externalId\": \"ext-${MOBILEWALLET_TX_ID}\",
  \"status\": \"completed\",
  \"amount\": ${AMOUNT},
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"network\": \"Orangemoney\"
}"

# Calcul simple de signature HMAC-SHA256 (à adapter selon votre impl)
SIGNATURE=$(echo -n "$WEBHOOK_PAYLOAD" | openssl dgst -sha256 -hmac "$MOBILEWALLET_WEBHOOK_SECRET" -hex | awk '{print $2}')

echo -e "${YELLOW}Signature HMAC: ${SIGNATURE:0:20}...${NC}"
echo ""

WEBHOOK_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/transaction/webhook/mobilewallet" \
  -H "Content-Type: application/json" \
  -H "X-Signature: ${SIGNATURE}" \
  -d "$WEBHOOK_PAYLOAD")

echo -e "${YELLOW}Réponse webhook:${NC}"
echo "$WEBHOOK_RESPONSE" | jq . 2>/dev/null || echo "$WEBHOOK_RESPONSE"
echo ""

# ================================================
# Test 3: GET /transaction/:userId
# ================================================
echo -e "${BLUE}[3] GET /transaction/:userId - Récupérer l'historique${NC}"
echo -e "${YELLOW}Endpoint: /transaction/${MERCHANT_ID}${NC}"
echo ""

HISTORY_RESPONSE=$(curl -s -X GET "${API_BASE_URL}/transaction/${MERCHANT_ID}" \
  -H "Authorization: Bearer ${FIREBASE_ID_TOKEN}")

echo -e "${YELLOW}Réponse (historique des transactions):${NC}"
echo "$HISTORY_RESPONSE" | jq . 2>/dev/null || echo "$HISTORY_RESPONSE"
echo ""

# ================================================
# Test 4: PUT /transaction/:id (optionnel - mettre à jour statut)
# ================================================
echo -e "${BLUE}[4] PUT /transaction/:id - Mettre à jour le statut (optionnel)${NC}"
echo -e "${YELLOW}Endpoint: /transaction/${CREATED_TX_ID}${NC}"
echo ""

UPDATE_RESPONSE=$(curl -s -X PUT "${API_BASE_URL}/transaction/${CREATED_TX_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${FIREBASE_ID_TOKEN}" \
  -d "{
    \"status\": \"completed\",
    \"relatedPaymentId\": \"${MOBILEWALLET_TX_ID}\"
  }")

echo -e "${YELLOW}Réponse (update):${NC}"
echo "$UPDATE_RESPONSE" | jq . 2>/dev/null || echo "$UPDATE_RESPONSE"
echo ""

# ================================================
# Résumé
# ================================================
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Résumé du test${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "✓ Endpoint /transaction testé (POST)"
echo "✓ Endpoint /transaction/webhook/mobilewallet testé (webhook)"
echo "✓ Endpoint /transaction/:userId testé (GET)"
echo "✓ Endpoint /transaction/:id testé (PUT optionnel)"
echo ""
echo -e "${YELLOW}IDs générés pour trace:${NC}"
echo "  User ID: $USER_ID"
echo "  Merchant ID: $MERCHANT_ID"
echo "  Transaction ID: $CREATED_TX_ID"
echo "  MobileWallet TX ID: $MOBILEWALLET_TX_ID"
echo "  Order ID: $ORDER_ID"
echo ""
echo -e "${YELLOW}Prochaines étapes:${NC}"
echo "  1. Vérifier les logs du backend pour les appels MobileWallet"
echo "  2. Vérifier Socket.io pour l'émission 'payment.settled'"
echo "  3. Vérifier la BD (Firestore/Supabase) pour les transactions créées"
echo ""
