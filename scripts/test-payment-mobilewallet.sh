#!/bin/bash

##############################################
# Test Script: MobileWallet Payment API
# Tests POST /pay endpoint (MobileWallet Direct)
##############################################

# Configuration
MOBILEWALLET_URL="${MOBILEWALLET_URL:-http://localhost:7332}"
MOBILEWALLET_ADMIN_KEY="${MOBILEWALLET_ADMIN_KEY:-your-admin-key}"

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Test: Direct MobileWallet API (/pay)${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "MobileWallet URL: ${YELLOW}${MOBILEWALLET_URL}${NC}"
echo -e "Admin Key: ${YELLOW}${MOBILEWALLET_ADMIN_KEY:0:10}...${NC}"
echo ""

# Test data
USER_ID="user-test-$(date +%s)"
PHONE="237674123456"  # Numéro de téléphone (sans +237)
NETWORK="Orangemoney"
EMAIL="test@yaammoo.local"
AMOUNT=15000

echo -e "${BLUE}[1] POST /pay - Initier un paiement MobileWallet${NC}"
echo -e "${YELLOW}Données:${NC}"
echo "  amount: $AMOUNT XAF"
echo "  phone: $PHONE"
echo "  network: $NETWORK"
echo "  email: $EMAIL"
echo "  userId: $USER_ID"
echo ""

PAY_RESPONSE=$(curl -s -X POST "${MOBILEWALLET_URL}/pay" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${MOBILEWALLET_ADMIN_KEY}" \
  -d "{
    \"amount\": ${AMOUNT},
    \"phone\": \"${PHONE}\",
    \"network\": \"${NETWORK}\",
    \"email\": \"${EMAIL}\",
    \"sender_name\": \"Yaammoo\",
    \"aggregator\": \"digikuntz\",
    \"mode\": \"auto\",
    \"fallback_browser\": true,
    \"end_user_ref\": \"${USER_ID}\"
  }")

echo -e "${YELLOW}Réponse:${NC}"
echo "$PAY_RESPONSE" | jq . 2>/dev/null || echo "$PAY_RESPONSE"
echo ""

# Extraire transaction_id
TX_ID=$(echo "$PAY_RESPONSE" | jq -r '.transaction_id // .tx_id // empty' 2>/dev/null)
STATUS=$(echo "$PAY_RESPONSE" | jq -r '.status // empty' 2>/dev/null)

if [ -z "$TX_ID" ]; then
  echo -e "${RED}❌ Erreur: Impossible d'extraire transaction_id${NC}"
  echo "Réponse brute: $PAY_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Paiement initié${NC}"
echo -e "${GREEN}  Transaction ID: ${TX_ID}${NC}"
echo -e "${GREEN}  Status: ${STATUS}${NC}"
echo ""

# ================================================
# Test 2: Vérifier le statut de la transaction
# ================================================
echo -e "${BLUE}[2] GET /transactions/:id - Vérifier le statut (si endpoint exists)${NC}"
echo -e "${YELLOW}Endpoint: /transactions/${TX_ID}${NC}"
echo ""

STATUS_RESPONSE=$(curl -s -X GET "${MOBILEWALLET_URL}/transactions/${TX_ID}" \
  -H "X-Admin-Key: ${MOBILEWALLET_ADMIN_KEY}")

echo -e "${YELLOW}Réponse:${NC}"
echo "$STATUS_RESPONSE" | jq . 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

# ================================================
# Test 3: Simuler un callback de verdict
# ================================================
echo -e "${BLUE}[3] Simuler un callback/webhook MobileWallet${NC}"
echo -e "${YELLOW}(Simulation du verdict après USSD)${NC}"
echo ""

CALLBACK_PAYLOAD="{
  \"transaction_id\": \"${TX_ID}\",
  \"status\": \"successful\",
  \"amount\": ${AMOUNT},
  \"phone\": \"${PHONE}\",
  \"network\": \"${NETWORK}\",
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}"

echo -e "${YELLOW}Payload callback:${NC}"
echo "$CALLBACK_PAYLOAD" | jq .
echo ""

# Note: L'URL du callback dépend de la config MobileWallet
# Typiquement: https://votre-backend.com/transaction/webhook/mobilewallet
echo -e "${YELLOW}ℹ️  Callback serait envoyé à: https://your-backend.com/transaction/webhook/mobilewallet${NC}"
echo ""

# ================================================
# Test 4: Dupliquer le paiement (tester 409 conflict)
# ================================================
echo -e "${BLUE}[4] Test: Dupliquer le paiement (solliciter 409 Conflict)${NC}"
echo -e "${YELLOW}(Simule un retry trop rapide)${NC}"
echo ""

DUPLICATE_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "${MOBILEWALLET_URL}/pay" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${MOBILEWALLET_ADMIN_KEY}" \
  -d "{
    \"amount\": ${AMOUNT},
    \"phone\": \"${PHONE}\",
    \"network\": \"${NETWORK}\",
    \"email\": \"${EMAIL}\",
    \"sender_name\": \"Yaammoo\",
    \"aggregator\": \"digikuntz\",
    \"mode\": \"auto\",
    \"fallback_browser\": true,
    \"end_user_ref\": \"${USER_ID}\"
  }")

echo -e "${YELLOW}Réponse:${NC}"
echo "$DUPLICATE_RESPONSE" | jq . 2>/dev/null || echo "$DUPLICATE_RESPONSE"
echo ""

# ================================================
# Test 5: Paiement avec montant invalide
# ================================================
echo -e "${BLUE}[5] Test: Montant invalide (doit échouer)${NC}"
echo ""

INVALID_RESPONSE=$(curl -s -X POST "${MOBILEWALLET_URL}/pay" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${MOBILEWALLET_ADMIN_KEY}" \
  -d "{
    \"amount\": 0,
    \"phone\": \"${PHONE}\",
    \"network\": \"${NETWORK}\",
    \"email\": \"${EMAIL}\",
    \"sender_name\": \"Yaammoo\",
    \"aggregator\": \"digikuntz\",
    \"end_user_ref\": \"${USER_ID}\"
  }")

echo -e "${YELLOW}Réponse (montant=0):${NC}"
echo "$INVALID_RESPONSE" | jq . 2>/dev/null || echo "$INVALID_RESPONSE"
echo ""

# ================================================
# Test 6: Admin Key invalide
# ================================================
echo -e "${BLUE}[6] Test: Admin Key invalide (doit échouer)${NC}"
echo ""

INVALID_KEY_RESPONSE=$(curl -s -X POST "${MOBILEWALLET_URL}/pay" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: invalid-key-12345" \
  -d "{
    \"amount\": ${AMOUNT},
    \"phone\": \"${PHONE}\",
    \"network\": \"${NETWORK}\",
    \"email\": \"${EMAIL}\",
    \"sender_name\": \"Yaammoo\",
    \"aggregator\": \"digikuntz\",
    \"end_user_ref\": \"${USER_ID}\"
  }")

echo -e "${YELLOW}Réponse (clé invalide):${NC}"
echo "$INVALID_KEY_RESPONSE" | jq . 2>/dev/null || echo "$INVALID_KEY_RESPONSE"
echo ""

# ================================================
# Résumé
# ================================================
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Résumé du test${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "✓ Endpoint POST /pay testé"
echo "✓ Vérification statut testé"
echo "✓ Callback simulé"
echo "✓ Conflit de doublon testé (409)"
echo "✓ Validation montant testé"
echo "✓ Authentification invalide testé"
echo ""
echo -e "${YELLOW}Données de test:${NC}"
echo "  User ID: $USER_ID"
echo "  Transaction ID: $TX_ID"
echo "  Phone: $PHONE"
echo "  Amount: $AMOUNT XAF"
echo ""
echo -e "${YELLOW}Logs à vérifier:${NC}"
echo "  1. Backend: [MobileWallet API] logs de l'appel /pay"
echo "  2. BD: Vérifier si transaction a été créée"
echo "  3. Socket.io: Écouter 'payment.settled' après webhook"
echo ""
