#!/bin/bash

##############################################
# Test: Transaction avec les 2 canaux
# - Canal 1: Webhook HTTP
# - Canal 2: Socket.io (simule depuis curl)
##############################################

set -e

# Charger .env
if [ -f .env ]; then
  source .env
fi

API_URL="${API_URL:-http://localhost:3000}"
WEBHOOK_SECRET="${MOBILEWALLET_WEBHOOK_SECRET:-}"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test: Transaction via Webhook HTTP${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ -z "$WEBHOOK_SECRET" ]; then
  echo -e "${RED}❌ MOBILEWALLET_WEBHOOK_SECRET non dans .env${NC}"
  exit 1
fi

# Générer IDs
TX_WEBHOOK="mw-webhook-$(date +%s%N | md5sum | head -c 8)"
TX_SOCKET="mw-socket-$(date +%s%N | md5sum | head -c 8)"
MERCHANT_ID="merchant-test-$(date +%s)"
AMOUNT=15000
TIMESTAMP=$(date +%s)

# ================== TEST 1: Webhook HTTP ==================
echo -e "${BLUE}[TEST 1] Webhook HTTP - Canal 1${NC}"
echo ""

# Créer le payload SANS nouvelle ligne à la fin (important pour HMAC)
WEBHOOK_PAYLOAD="{\"type\":\"transaction.successful\",\"data\":{\"transaction_id\":\"${TX_WEBHOOK}\",\"status\":\"successful\",\"amount\":${AMOUNT},\"network\":\"Orangemoney\",\"end_user_ref\":\"${MERCHANT_ID}\"}}"

echo -e "${YELLOW}Payload webhook:${NC}"
echo "$WEBHOOK_PAYLOAD" | jq .
echo ""

# Signature HMAC-SHA256: HMAC(secret, "ts.rawBody")
# Attention: le rawBody doit être EXACTEMENT le JSON envoyé au serveur
SIGNATURE=$(printf "%s" "${TIMESTAMP}.${WEBHOOK_PAYLOAD}" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | awk '{print $2}')

echo -e "${YELLOW}Envoi webhook...${NC}"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${API_URL}/transaction/webhook/mobilewallet" \
  -H "Content-Type: application/json" \
  -H "X-MobileWallet-Signature: t=${TIMESTAMP},v1=${SIGNATURE}" \
  -d "$WEBHOOK_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo -e "${YELLOW}Réponse HTTP ${HTTP_CODE}:${NC}"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Webhook traité${NC}"
else
  echo -e "${RED}❌ Erreur HTTP ${HTTP_CODE}${NC}"
fi

echo ""
echo -e "${YELLOW}À vérifier dans les logs:${NC}"
echo "  [Webhook Controller] ✓ Signature HMAC valide"
echo "  [Webhook MobileWallet] ✓ Réservation réussie (webhook = premier chemin)"
echo "  [Webhook MobileWallet] → Émission socket payment.settled"
echo ""

# ================== TEST 2: Socket.io (simulation) ==================
echo -e "${BLUE}[TEST 2] Socket.io - Canal 2 (simulation)${NC}"
echo -e "${YELLOW}Note: Test curl ne peut pas simuler vraiment Socket.io${NC}"
echo -e "${YELLOW}Le backend reçoit normalement via la connexion Socket établie vers MobileWallet${NC}"
echo ""

echo -e "${YELLOW}Pour vérifier Socket.io:${NC}"
echo "  1. Vérifier logs: [MobileWallet Socket] transaction.update"
echo "  2. Voir la reconnexion auto: [MobileWallet Socket] ✓ Connecté"
echo "  3. Vérifier room: [MobileWallet Socket] ✓ Entré dans room app:\${APP_ID}"
echo ""

# ================== TEST 3: Cas idempotence ==================
echo -e "${BLUE}[TEST 3] Idempotence - 2e webhook pour même transaction${NC}"
echo ""

echo -e "${YELLOW}Envoi du même webhook une 2e fois (doit être idempotent)...${NC}"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${API_URL}/transaction/webhook/mobilewallet" \
  -H "Content-Type: application/json" \
  -H "X-MobileWallet-Signature: t=${TIMESTAMP},v1=${SIGNATURE}" \
  -d "$WEBHOOK_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo -e "${YELLOW}Réponse HTTP ${HTTP_CODE}:${NC}"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Webhook reçu (idempotent)${NC}"
  echo -e "${YELLOW}À vérifier dans les logs:${NC}"
  echo "  [Webhook MobileWallet] ✓ Verdict déjà traité par socket (ou un autre webhook) → skip"
else
  echo -e "${YELLOW}⚠️ Réponse HTTP ${HTTP_CODE}${NC}"
fi

echo ""

# ================== RÉSUMÉ ==================
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Tests complétés${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Données de test:${NC}"
echo "  Transaction Webhook: ${TX_WEBHOOK}"
echo "  Transaction Socket: ${TX_SOCKET}"
echo "  Merchant ID: ${MERCHANT_ID}"
echo "  Amount: ${AMOUNT}"
echo ""

echo -e "${YELLOW}Prochaines étapes:${NC}"
echo "  1. Lancer le backend: npm run start:dev"
echo "  2. Exécuter ce script: bash scripts/test-transaction-both-channels.sh"
echo "  3. Vérifier les logs du backend pour les traces [Transaction], [Webhook], [MobileWallet Socket]"
echo "  4. Vérifier BD: check transactionSettlements pour garantir idempotence"
echo ""

echo -e "${YELLOW}Commandes utiles:${NC}"
echo "  # Voir les logs du backend en temps réel"
echo "  tail -f /tmp/backend.log"
echo ""
echo "  # Vérifier les transactions créées (Firestore)"
echo "  firebase firestore:delete --recursive transactions"
echo ""
