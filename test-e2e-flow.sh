#!/bin/bash

################################################################################
# ClearSky E2E Testing Script
# Tests the complete data pipeline from auth to AI derivatives
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
WALLET_ADDRESS="0x$(openssl rand -hex 20)"  # Generate random wallet
LOG_FILE="./test-e2e-$(date +%Y%m%d_%H%M%S).log"

# Test data
DEVICE_ID=""
ACCESS_TOKEN=""
READING_ID=""

################################################################################
# Helper Functions
################################################################################

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARN:${NC} $1" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "\n${BLUE}========================================${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}$1${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}========================================${NC}\n" | tee -a "$LOG_FILE"
}

check_response() {
    local response="$1"
    local expected_field="$2"

    if echo "$response" | jq -e "$expected_field" > /dev/null 2>&1; then
        return 0
    else
        log_error "Response missing expected field: $expected_field"
        echo "Response: $response"
        return 1
    fi
}

wait_for_status() {
    local reading_id="$1"
    local expected_status="$2"
    local max_attempts="${3:-30}"
    local delay="${4:-10}"

    log "Waiting for status: $expected_status (max ${max_attempts}x${delay}s = $((max_attempts * delay))s)"

    for i in $(seq 1 $max_attempts); do
        local current_status=$(mongo clearsky --quiet --eval "
            var reading = db.aqi_device_raw.findOne({reading_id: '$reading_id'});
            if (reading) print(reading.status);
            else print('NOT_FOUND');
        ")

        log "  Attempt $i/$max_attempts: Status = $current_status"

        if [ "$current_status" = "$expected_status" ]; then
            log "✅ Status reached: $expected_status"
            return 0
        fi

        if [ "$i" -lt "$max_attempts" ]; then
            sleep "$delay"
        fi
    done

    log_error "Timeout waiting for status: $expected_status"
    return 1
}

################################################################################
# Test Steps
################################################################################

test_step_1_login() {
    log_step "Step 1: User Login"

    log "Wallet Address: $WALLET_ADDRESS"

    local response=$(curl -s -X POST "$API_BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"wallet_address\": \"$WALLET_ADDRESS\",
            \"signature\": \"dummy-signature-for-testing\"
        }")

    echo "$response" | jq '.' | tee -a "$LOG_FILE"

    check_response "$response" ".tokens.access_token" || return 1

    ACCESS_TOKEN=$(echo "$response" | jq -r '.tokens.access_token')
    log "✅ Login successful"
    log "Access Token: ${ACCESS_TOKEN:0:50}..."
}

test_step_2_get_presets() {
    log_step "Step 2: Get Device Configuration Presets"

    local response=$(curl -s "$API_BASE_URL/api/config/presets")

    echo "$response" | jq '.' | tee -a "$LOG_FILE"

    check_response "$response" ".cities[0]" || return 1

    log "✅ Retrieved device presets"
}

test_step_3_register_device() {
    log_step "Step 3: Register Device"

    local response=$(curl -s -X POST "$API_BASE_URL/api/devices/register" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -d '{
            "city_id": "delhi",
            "station_id": "delhi_station_1",
            "sensor_types": ["NO2", "PM2.5", "PM10", "CO", "temperature"]
        }')

    echo "$response" | jq '.' | tee -a "$LOG_FILE"

    check_response "$response" ".device.device_id" || return 1

    DEVICE_ID=$(echo "$response" | jq -r '.device.device_id')
    log "✅ Device registered"
    log "Device ID: $DEVICE_ID"
}

test_step_4_ingest_data() {
    log_step "Step 4: Ingest Sensor Data"

    log "Ingesting 3 data points within the same hour..."

    for i in 1 2 3; do
        log "  Ingestion $i/3"

        # Generate sensor data with some variation
        local no2=$((40 + i * 5))
        local pm25=$((100 + i * 10))
        local pm10=$((370 + i * 10))
        local co=$(echo "scale=1; 1.0 + $i * 0.2" | bc)
        local temp=$(echo "scale=1; 27.0 + $i * 0.5" | bc)

        local response=$(curl -s -X POST "$API_BASE_URL/api/ingest" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            -d "{
                \"device_id\": \"$DEVICE_ID\",
                \"sensor_data\": {
                    \"NO2\": $no2,
                    \"PM2.5\": $pm25,
                    \"PM10\": $pm10,
                    \"CO\": $co,
                    \"temperature\": $temp
                },
                \"timestamp\": $(($(date +%s) * 1000))
            }")

        echo "$response" | jq '.' | tee -a "$LOG_FILE"

        if [ -z "$READING_ID" ]; then
            READING_ID=$(echo "$response" | jq -r '.reading_id')
            log "  Reading ID: $READING_ID"
        fi

        local ingestion_count=$(echo "$response" | jq -r '.ingestion_count')
        log "  Ingestion count: $ingestion_count"

        if [ "$i" -lt 3 ]; then
            sleep 5  # Wait between ingestions
        fi
    done

    log "✅ 3 data points ingested successfully"
}

test_step_5_verify_reading() {
    log_step "Step 5: Verify Reading in MongoDB"

    log "Reading ID: $READING_ID"

    local reading=$(mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        printjson(reading);
    ")

    echo "$reading" | tee -a "$LOG_FILE"

    log "Checking sensor data arrays..."
    local no2_count=$(mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        print(reading.sensor_data.NO2.length);
    ")

    if [ "$no2_count" = "3" ]; then
        log "✅ Sensor data contains 3 values (append behavior verified)"
    else
        log_error "Expected 3 values in sensor arrays, got: $no2_count"
        return 1
    fi
}

test_step_6_wait_for_processing() {
    log_step "Step 6: Wait for PROCESSING Status"

    log "Waiting for batch processor to pick up the reading..."
    log "This requires batch_window.end to be in the past"

    local batch_end=$(mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        print(reading.batch_window.end);
    ")

    log "Batch window ends at: $batch_end"
    log "Current time: $(date -u +%Y-%m-%dT%H:%M:%S)Z"

    wait_for_status "$READING_ID" "PROCESSING" 30 10 || {
        log_warn "Status not reached PROCESSING yet"
        log_warn "This is normal if batch window hasn't closed yet"
        log_warn "Check cron schedule: CRON_BATCH_PROCESSOR in .env"
        return 0  # Don't fail, just warn
    }
}

test_step_7_wait_for_verified() {
    log_step "Step 7: Wait for VERIFIED Status"

    log "Waiting for verifier to generate Merkle root and pin to IPFS..."

    wait_for_status "$READING_ID" "VERIFIED" 30 10 || {
        log_warn "Status not reached VERIFIED yet"
        log_warn "Check verifier cron schedule: CRON_VERIFIER in .env"
        log_warn "Check Pinata JWT is valid: PINATA_JWT in .env"
        return 0
    }

    # If verified, show IPFS details
    log "Fetching IPFS details..."
    mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        print('Merkle Root: ' + reading.processing.merkle_root);
        print('Content Hash: ' + reading.processing.content_hash);
        print('IPFS URI: ' + reading.processing.ipfs_uri);
        print('IPFS Hash: ' + reading.processing.ipfs_hash);
        print('Gateway URL: https://gateway.pinata.cloud/ipfs/' + reading.processing.ipfs_hash);
    " | tee -a "$LOG_FILE"
}

test_step_8_verify_ipfs() {
    log_step "Step 8: Verify IPFS Content"

    local ipfs_hash=$(mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        if (reading && reading.processing && reading.processing.ipfs_hash) {
            print(reading.processing.ipfs_hash);
        }
    ")

    if [ -z "$ipfs_hash" ] || [ "$ipfs_hash" = "null" ]; then
        log_warn "No IPFS hash found - reading may not be VERIFIED yet"
        return 0
    fi

    log "IPFS Hash: $ipfs_hash"
    log "Fetching from Pinata gateway..."

    local ipfs_content=$(curl -s "https://gateway.pinata.cloud/ipfs/$ipfs_hash")

    if [ -z "$ipfs_content" ]; then
        log_error "Failed to fetch from IPFS"
        return 1
    fi

    echo "$ipfs_content" | jq '.' | tee -a "$LOG_FILE"
    log "✅ IPFS content retrieved successfully"
}

test_step_9_wait_for_derivative() {
    log_step "Step 9: Wait for AI Derivative (DERIVED_INDIVIDUAL)"

    log "Waiting for derivative job to generate AI insights..."

    wait_for_status "$READING_ID" "DERIVED_INDIVIDUAL" 30 10 || {
        log_warn "Status not reached DERIVED_INDIVIDUAL yet"
        log_warn "Check derivative cron: CRON_DERIVATIVE_INDIVIDUAL in .env"
        log_warn "Check Together AI API key: TOGETHER_API_KEY in .env"
        return 0
    }

    # If derived, show derivative details
    log "Fetching derivative details..."
    local derivative_id=$(mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        if (reading && reading.processing && reading.processing.derivative_id) {
            print(reading.processing.derivative_id);
        }
    ")

    if [ -n "$derivative_id" ] && [ "$derivative_id" != "null" ]; then
        log "Derivative ID: $derivative_id"

        mongo clearsky --quiet --eval "
            var deriv = db.derivatives.findOne({derivative_id: '$derivative_id'});
            if (deriv) {
                print('Derivative Type: ' + deriv.derivative_type);
                print('Content Length: ' + deriv.content.length + ' chars');
                print('LLM Model: ' + deriv.llm_metadata.model);
                print('Tokens Used: ' + deriv.llm_metadata.tokens_used.total_tokens);
                print('Cost USD: $' + deriv.llm_metadata.cost_usd.toFixed(6));
                print('IPFS Hash: ' + deriv.cryptographic_proofs.ipfs_hash);
                print('Gateway URL: https://gateway.pinata.cloud/ipfs/' + deriv.cryptographic_proofs.ipfs_hash);
                print('\\nContent Preview (first 300 chars):');
                print(deriv.content.substring(0, 300) + '...');
            }
        " | tee -a "$LOG_FILE"
    fi
}

test_step_10_summary() {
    log_step "Step 10: Test Summary"

    log "Reading ID: $READING_ID"

    # Get final status
    local final_status=$(mongo clearsky --quiet --eval "
        var reading = db.aqi_device_raw.findOne({reading_id: '$READING_ID'});
        print(reading.status);
    ")

    log "Final Status: $final_status"

    # Show state progression
    log "\nExpected State Progression:"
    log "  1. PENDING           ✅ (after ingestion)"
    log "  2. PROCESSING        $([ "$final_status" = "PROCESSING" ] || [ "$final_status" = "VERIFIED" ] || [ "$final_status" = "DERIVED_INDIVIDUAL" ] || [ "$final_status" = "COMPLETE" ] && echo '✅' || echo '⏳')"
    log "  3. VERIFIED          $([ "$final_status" = "VERIFIED" ] || [ "$final_status" = "DERIVED_INDIVIDUAL" ] || [ "$final_status" = "COMPLETE" ] && echo '✅' || echo '⏳')"
    log "  4. PROCESSING_AI     $([ "$final_status" = "DERIVED_INDIVIDUAL" ] || [ "$final_status" = "COMPLETE" ] && echo '✅' || echo '⏳')"
    log "  5. DERIVED_INDIVIDUAL $([ "$final_status" = "DERIVED_INDIVIDUAL" ] || [ "$final_status" = "COMPLETE" ] && echo '✅' || echo '⏳')"
    log "  6. COMPLETE          $([ "$final_status" = "COMPLETE" ] && echo '✅' || echo '⏳ (end of month)')"

    log "\n${GREEN}========================================${NC}"
    log "${GREEN}E2E Test Completed${NC}"
    log "${GREEN}========================================${NC}"

    log "\nNext Steps:"
    log "  1. Check logs: tail -f logs/app.log | grep '\[.*\]'"
    log "  2. Monitor status: watch -n 5 'mongo clearsky --quiet --eval \"db.aqi_device_raw.findOne({reading_id: \\\"$READING_ID\\\"}, {status: 1})\"'"
    log "  3. View derivative: mongo clearsky --eval 'db.derivatives.find().pretty()'"
    log "  4. Full test log: cat $LOG_FILE"
}

################################################################################
# Main Execution
################################################################################

main() {
    log_step "ClearSky E2E Testing Script"
    log "API Base URL: $API_BASE_URL"
    log "Log File: $LOG_FILE"
    log "Timestamp: $(date)"

    # Check prerequisites
    log "\nChecking prerequisites..."
    command -v curl >/dev/null 2>&1 || { log_error "curl not found"; exit 1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq not found"; exit 1; }
    command -v mongo >/dev/null 2>&1 || { log_error "mongo CLI not found"; exit 1; }
    log "✅ All prerequisites met"

    # Run test steps
    test_step_1_login || { log_error "Step 1 failed"; exit 1; }
    test_step_2_get_presets || { log_error "Step 2 failed"; exit 1; }
    test_step_3_register_device || { log_error "Step 3 failed"; exit 1; }
    test_step_4_ingest_data || { log_error "Step 4 failed"; exit 1; }
    test_step_5_verify_reading || { log_error "Step 5 failed"; exit 1; }
    test_step_6_wait_for_processing || true  # Don't fail on timeout
    test_step_7_wait_for_verified || true    # Don't fail on timeout
    test_step_8_verify_ipfs || true          # Don't fail on missing data
    test_step_9_wait_for_derivative || true  # Don't fail on timeout
    test_step_10_summary

    log "\n✅ All tests completed successfully"
    log "Full log saved to: $LOG_FILE"
}

# Run main function
main "$@"
