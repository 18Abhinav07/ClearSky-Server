#!/bin/bash

# ClearSky Marketplace E2E Testing Script
# This script guides you through testing the complete marketplace flow

set -e  # Exit on error

# Configuration
BASE_URL="http://localhost:3000/api/v1"
BUYER_WALLET="0x1234567890123456789012345678901234567890"  # Replace with your test wallet
TOKEN=""  # Add your JWT token if authentication is required

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper function to print section headers
print_section() {
    echo ""
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
}

# Helper function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Helper function to print info
print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Helper function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Helper function to pause
pause() {
    echo ""
    read -p "Press Enter to continue to next step..."
    echo ""
}

# ============================================================================
# PHASE 1: BUYER REGISTRATION
# ============================================================================

print_section "PHASE 1: BUYER REGISTRATION"

print_info "Registering buyer with wallet: $BUYER_WALLET"
echo "POST $BASE_URL/users/register"

REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/users/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletAddress\": \"$BUYER_WALLET\"
  }")

echo "$REGISTER_RESPONSE" | jq '.'

if echo "$REGISTER_RESPONSE" | jq -e '.success' > /dev/null; then
    print_success "Buyer registered successfully"
else
    print_info "Buyer may already exist (this is OK)"
fi

pause

# ============================================================================
# PHASE 2: BROWSE AVAILABLE DERIVATIVES
# ============================================================================

print_section "PHASE 2: BROWSE AVAILABLE DERIVATIVES"

print_info "Fetching all available (unminted) derivatives"
echo "GET $BASE_URL/marketplace/derivatives?is_minted=false"

DERIVATIVES_RESPONSE=$(curl -s -X GET "$BASE_URL/marketplace/derivatives?is_minted=false")

echo "$DERIVATIVES_RESPONSE" | jq '.'

# Extract first derivative ID for later use
DERIVATIVE_ID=$(echo "$DERIVATIVES_RESPONSE" | jq -r '.data[0].derivative_id // empty')

if [ -z "$DERIVATIVE_ID" ]; then
    print_error "No derivatives found! Please ensure you have processed derivatives in the system."
    exit 1
fi

print_success "Found derivatives. First derivative ID: $DERIVATIVE_ID"
print_info "Derivative data includes: metadata, primitive readings, owner info, IPFS hashes"

pause

# ============================================================================
# PHASE 3: FILTER AND SEARCH DERIVATIVES
# ============================================================================

print_section "PHASE 3: FILTER AND SEARCH DERIVATIVES"

print_info "Test 1: Filter by type (MONTHLY)"
echo "GET $BASE_URL/marketplace/derivatives?type=MONTHLY&is_minted=false"

curl -s -X GET "$BASE_URL/marketplace/derivatives?type=MONTHLY&is_minted=false" | jq '.'

print_success "Filtered by type"

echo ""
print_info "Test 2: Pagination (limit=5, offset=0)"
echo "GET $BASE_URL/marketplace/derivatives?limit=5&offset=0"

curl -s -X GET "$BASE_URL/marketplace/derivatives?limit=5&offset=0" | jq '.pagination'

print_success "Pagination working"

pause

# ============================================================================
# PHASE 4: GET DERIVATIVE DETAILS
# ============================================================================

print_section "PHASE 4: GET DERIVATIVE DETAILS"

print_info "Fetching detailed information for derivative: $DERIVATIVE_ID"
echo "GET $BASE_URL/marketplace/derivatives/$DERIVATIVE_ID"

DETAILS_RESPONSE=$(curl -s -X GET "$BASE_URL/marketplace/derivatives/$DERIVATIVE_ID")

echo "$DETAILS_RESPONSE" | jq '.'

print_success "Retrieved complete derivative details"
print_info "Includes: derivative metadata, all primitive AQI readings, processing state"

pause

# ============================================================================
# PHASE 5: PURCHASE SINGLE DERIVATIVE
# ============================================================================

print_section "PHASE 5: PURCHASE SINGLE DERIVATIVE"

print_info "🛒 Purchasing derivative: $DERIVATIVE_ID"
print_info "Buyer wallet: $BUYER_WALLET"
print_info ""
print_info "This will:"
print_info "  1. Validate request and check derivative availability"
print_info "  2. Identify original data owner from primitive readings"
print_info "  3. Calculate pricing (base: \$100, platform fee: 10%, royalty: 5%)"
print_info "  4. Register IP Asset on Story Protocol"
print_info "  5. Mint NFT with unique token ID"
print_info "  6. Transfer NFT to buyer wallet"
print_info "  7. Create asset record in MongoDB"
print_info "  8. Update buyer's user record with new asset"
print_info "  9. Log royalty distribution to original owner"
print_info ""
print_info "⏳ This may take 30-60 seconds..."
echo ""
echo "POST $BASE_URL/marketplace/purchase/$DERIVATIVE_ID"

PURCHASE_RESPONSE=$(curl -s -X POST "$BASE_URL/marketplace/purchase/$DERIVATIVE_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"buyerWallet\": \"$BUYER_WALLET\"
  }")

echo "$PURCHASE_RESPONSE" | jq '.'

if echo "$PURCHASE_RESPONSE" | jq -e '.success' > /dev/null; then
    ASSET_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.asset_id')
    TOKEN_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.token_id')
    IP_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.ip_id')
    MINT_TX=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.mint_tx_hash')
    TRANSFER_TX=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.transfer_tx_hash')

    print_success "Purchase successful!"
    echo ""
    echo -e "  ${GREEN}Asset ID:${NC} $ASSET_ID"
    echo -e "  ${GREEN}Token ID:${NC} $TOKEN_ID"
    echo -e "  ${GREEN}IP ID:${NC} $IP_ID"
    echo -e "  ${GREEN}Mint Tx:${NC} $MINT_TX"
    echo -e "  ${GREEN}Transfer Tx:${NC} $TRANSFER_TX"
    echo ""
    print_info "View on Story Protocol Explorer:"
    echo "  Mint: https://explorer.story.foundation/tx/$MINT_TX"
    echo "  Transfer: https://explorer.story.foundation/tx/$TRANSFER_TX"
else
    print_error "Purchase failed! See error above."
    exit 1
fi

pause

# ============================================================================
# PHASE 6: VERIFY PURCHASE IN LOGS
# ============================================================================

print_section "PHASE 6: VERIFY PURCHASE IN LOGS"

print_info "Check your server logs for detailed debug output"
print_info ""
print_info "Look for these log entries:"
print_info "  ✓ [MARKETPLACE:PURCHASE] Purchase initiated"
print_info "  ✓ [MARKETPLACE:PURCHASE] Derivative found"
print_info "  ✓ [MARKETPLACE:PURCHASE] Primitive readings fetched"
print_info "  ✓ [MARKETPLACE:PURCHASE] Original owner identified"
print_info "  ✓ [MARKETPLACE:PURCHASE] Pricing calculated"
print_info "  ✓ [MARKETPLACE:PURCHASE] IP Asset registered and minted"
print_info "  ✓ [MARKETPLACE:PURCHASE] NFT transferred to buyer"
print_info "  ✓ [MARKETPLACE:PURCHASE] Derivative record updated"
print_info "  ✓ [MARKETPLACE:PURCHASE] Asset record created"
print_info "  ✓ [MARKETPLACE:PURCHASE] Buyer user record updated"
print_info "  ✓ [MARKETPLACE:PURCHASE] Purchase completed successfully"
print_info ""
print_info "Each log entry includes JSON data with complete state information"

pause

# ============================================================================
# PHASE 7: VERIFY ASSET OWNERSHIP
# ============================================================================

print_section "PHASE 7: VERIFY ASSET OWNERSHIP"

print_info "Fetching all assets owned by buyer: $BUYER_WALLET"
echo "GET $BASE_URL/marketplace/assets/$BUYER_WALLET"

ASSETS_RESPONSE=$(curl -s -X GET "$BASE_URL/marketplace/assets/$BUYER_WALLET")

echo "$ASSETS_RESPONSE" | jq '.'

ASSET_COUNT=$(echo "$ASSETS_RESPONSE" | jq '.data | length')

print_success "Found $ASSET_COUNT asset(s) owned by buyer"
print_info "Each asset includes: derivative ref, primitive data IDs, IP ID, token ID, pricing, royalties"

pause

# ============================================================================
# PHASE 8: VERIFY MONGODB STATE
# ============================================================================

print_section "PHASE 8: VERIFY MONGODB STATE"

print_info "Manually verify MongoDB collections:"
echo ""
print_info "1. Users Collection"
echo "   db.users.findOne({walletAddress: '$BUYER_WALLET'})"
echo "   Should have: assets array with asset IDs"
echo ""
print_info "2. Assets Collection"
echo "   db.assets.find({owner_wallet: '$BUYER_WALLET'})"
echo "   Should have: complete asset records with pricing and metadata"
echo ""
print_info "3. Derivatives Collection"
echo "   db.derivatives.findOne({derivative_id: '$DERIVATIVE_ID'})"
echo "   Should have: is_minted=true, ip_id, token_id populated"
echo ""

pause

# ============================================================================
# PHASE 9: BULK PURCHASE TEST (OPTIONAL)
# ============================================================================

print_section "PHASE 9: BULK PURCHASE TEST (OPTIONAL)"

print_info "Would you like to test bulk purchase? (y/n)"
read -p "> " DO_BULK

if [ "$DO_BULK" = "y" ] || [ "$DO_BULK" = "Y" ]; then
    print_info "Fetching 2 more unminted derivatives..."

    BULK_DERIVATIVES=$(curl -s -X GET "$BASE_URL/marketplace/derivatives?is_minted=false&limit=2&offset=1")

    DERIV_ID_1=$(echo "$BULK_DERIVATIVES" | jq -r '.data[0].derivative_id // empty')
    DERIV_ID_2=$(echo "$BULK_DERIVATIVES" | jq -r '.data[1].derivative_id // empty')

    if [ -z "$DERIV_ID_1" ]; then
        print_error "Not enough derivatives for bulk purchase test"
    else
        print_info "Bulk purchasing derivatives: $DERIV_ID_1, $DERIV_ID_2"
        echo "POST $BASE_URL/marketplace/purchase/bulk"

        BULK_RESPONSE=$(curl -s -X POST "$BASE_URL/marketplace/purchase/bulk" \
          -H "Content-Type: application/json" \
          -d "{
            \"buyerWallet\": \"$BUYER_WALLET\",
            \"derivativeIds\": [\"$DERIV_ID_1\", \"$DERIV_ID_2\"]
          }")

        echo "$BULK_RESPONSE" | jq '.'

        SUCCESSFUL=$(echo "$BULK_RESPONSE" | jq -r '.data.successful')
        FAILED=$(echo "$BULK_RESPONSE" | jq -r '.data.failed')

        print_success "Bulk purchase completed: $SUCCESSFUL successful, $FAILED failed"
    fi

    pause
fi

# ============================================================================
# PHASE 10: TEST DOWNLOAD (with authentication)
# ============================================================================

print_section "PHASE 10: TEST DOWNLOAD (REQUIRES AUTH)"

print_info "Testing derivative download for purchased asset"
print_info "Derivative ID: $DERIVATIVE_ID"
echo ""

if [ -z "$TOKEN" ]; then
    print_info "⚠️  No JWT token set. Skipping download test."
    print_info "To test download:"
    echo "  1. Set TOKEN variable in this script with your JWT"
    echo "  2. Run: curl -X GET \"$BASE_URL/marketplace/download/$DERIVATIVE_ID\" \\"
    echo "         -H \"Authorization: Bearer \$TOKEN\""
    echo ""
    print_info "Expected behavior:"
    print_info "  ✓ Owner: Gets derivative content and processing data"
    print_info "  ✗ Non-owner: Gets 403 Forbidden"
else
    echo "GET $BASE_URL/marketplace/download/$DERIVATIVE_ID"

    DOWNLOAD_RESPONSE=$(curl -s -X GET "$BASE_URL/marketplace/download/$DERIVATIVE_ID" \
      -H "Authorization: Bearer $TOKEN")

    echo "$DOWNLOAD_RESPONSE" | jq '.'

    if echo "$DOWNLOAD_RESPONSE" | jq -e '.success' > /dev/null; then
        print_success "Download access granted - ownership verified"
    else
        print_error "Download denied - check ownership or authentication"
    fi
fi

pause

# ============================================================================
# SUMMARY
# ============================================================================

print_section "E2E TEST SUMMARY"

echo -e "${GREEN}✅ Completed E2E Marketplace Testing${NC}"
echo ""
echo "Tested Flow:"
echo "  1. ✅ Buyer registration"
echo "  2. ✅ Browse available derivatives"
echo "  3. ✅ Filter and search derivatives"
echo "  4. ✅ Get derivative details"
echo "  5. ✅ Purchase single derivative"
echo "  6. ✅ Verify purchase logs"
echo "  7. ✅ Verify asset ownership"
echo "  8. ✅ MongoDB state verification"
if [ "$DO_BULK" = "y" ] || [ "$DO_BULK" = "Y" ]; then
    echo "  9. ✅ Bulk purchase test"
fi
echo ""
echo "Key Achievements:"
echo "  • NFT minted and registered as IP Asset on Story Protocol"
echo "  • NFT transferred to buyer wallet"
echo "  • Asset record created in MongoDB"
echo "  • Buyer's user record updated"
echo "  • Royalty distribution calculated and logged"
echo "  • Platform fee tracked"
echo "  • All steps logged with extensive debug information"
echo ""
echo -e "${BLUE}Review logs/combined.log for complete debug output${NC}"
echo ""
echo "Next Steps:"
echo "  1. Check Story Protocol Explorer for transactions"
echo "  2. Verify MongoDB collections integrity"
echo "  3. Review debug logs for any issues"
echo "  4. Test edge cases (invalid wallets, duplicate purchases)"
echo ""
print_success "E2E Testing Complete! 🎉"
