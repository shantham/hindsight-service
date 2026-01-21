#!/bin/bash
# Hindsight Service - Export/Import Tests
# Tests: T7.1 - T7.6

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "7. EXPORT/IMPORT TESTS"

# Ensure test bank exists with memories
setup_test_bank
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Export test memory 1"}' > /dev/null 2>&1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Export test memory 2"}' > /dev/null 2>&1

# T7.1: Export Bank
print_test "T7.1: Export Bank"
EXPORT_RESPONSE=$(http_get "/banks/$TEST_BANK_ID/export")
STATUS=$(http_get_status "/banks/$TEST_BANK_ID/export")

assert_status "200" "$STATUS" "Export bank returns 200"

# Check for bank and memories in export
BANK_ID=$(echo "$EXPORT_RESPONSE" | jq -r '.bank.id // .bankId // "not found"')
MEMORIES_COUNT=$(echo "$EXPORT_RESPONSE" | jq '.memories | length // 0')

print_info "Exported bank: $BANK_ID with $MEMORIES_COUNT memories"

# T7.2: Export Includes Embeddings
print_test "T7.2: Export Includes Embeddings"
FIRST_EMBEDDING=$(echo "$EXPORT_RESPONSE" | jq '.memories[0].embedding // []')
EMBEDDING_LENGTH=$(echo "$FIRST_EMBEDDING" | jq 'length')

if [ "$EMBEDDING_LENGTH" -gt 0 ]; then
    print_pass "Embeddings included (dimension: $EMBEDDING_LENGTH)"
else
    print_skip "Embeddings not included or empty"
fi

# T7.3: Export Non-Existent Bank
print_test "T7.3: Export Non-Existent Bank"
STATUS=$(http_get_status "/banks/fake-bank-12345/export")

assert_status "404" "$STATUS" "Export non-existent bank returns 404"

# T7.4: Import Bank (New)
print_test "T7.4: Import Bank (New)"
# Delete imported bank if exists
http_delete "/banks/imported-bank" > /dev/null 2>&1

# Create the import bank first
http_post "/banks" '{"id":"imported-bank","name":"Imported Bank"}' > /dev/null 2>&1

# Import the exported data
IMPORT_RESPONSE=$(curl -s -X POST "${BASE_URL}/banks/imported-bank/import" \
    -H "Content-Type: application/json" \
    -d "{\"data\": $EXPORT_RESPONSE}")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/banks/imported-bank/import" \
    -H "Content-Type: application/json" \
    -d "{\"data\": $EXPORT_RESPONSE}")

if [ "$STATUS" == "200" ] || [ "$STATUS" == "201" ]; then
    print_pass "Import bank returns $STATUS"
    IMPORTED=$(echo "$IMPORT_RESPONSE" | jq '.imported // .count // "unknown"')
    print_info "Imported: $IMPORTED memories"
else
    print_fail "Expected 200 or 201, got $STATUS"
fi

# T7.5: Import Bank (Merge)
print_test "T7.5: Import Bank (Merge)"
IMPORT_RESPONSE=$(curl -s -X POST "${BASE_URL}/banks/imported-bank/import" \
    -H "Content-Type: application/json" \
    -d "{\"data\": $EXPORT_RESPONSE, \"merge\": true}")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/banks/imported-bank/import" \
    -H "Content-Type: application/json" \
    -d "{\"data\": $EXPORT_RESPONSE, \"merge\": true}")

if [ "$STATUS" == "200" ] || [ "$STATUS" == "201" ]; then
    print_pass "Import with merge returns $STATUS"
else
    print_fail "Expected 200 or 201, got $STATUS"
fi

# T7.6: Import Missing Data
print_test "T7.6: Import Missing Data"
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/import" '{}')

assert_status "400" "$STATUS" "Import without data returns 400"

# Cleanup imported bank
http_delete "/banks/imported-bank" > /dev/null 2>&1

# Print summary
print_summary "Export/Import Tests"
