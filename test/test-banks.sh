#!/bin/bash
# Hindsight Service - Bank Management Tests
# Tests: T2.1 - T2.10

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "2. BANK MANAGEMENT TESTS"

# T2.1: List Banks
print_test "T2.1: List Banks"
RESPONSE=$(http_get "/banks")
STATUS=$(http_get_status "/banks")

assert_status "200" "$STATUS" "List banks returns 200"
# Response should be an array or have banks array
BANKS_TYPE=$(echo "$RESPONSE" | jq 'type')
if [ "$BANKS_TYPE" == '"array"' ]; then
    BANKS_COUNT=$(echo "$RESPONSE" | jq 'length')
else
    BANKS_COUNT=$(echo "$RESPONSE" | jq '.banks | length // 0')
fi
print_info "Found $BANKS_COUNT banks"

# T2.2: Create Bank (Minimal)
print_test "T2.2: Create Bank (Minimal)"
RESPONSE=$(http_post "/banks" '{"id":"test-minimal","name":"Minimal Bank"}')
STATUS=$(http_post_status "/banks" '{"id":"test-minimal","name":"Minimal Bank"}')

# Accept 200 or 201 for creation
if [ "$STATUS" == "200" ] || [ "$STATUS" == "201" ]; then
    print_pass "Create minimal bank returns $STATUS"
else
    print_fail "Expected 200 or 201, got $STATUS"
fi

# T2.3: Create Bank with Context
print_test "T2.3: Create Bank with Context"
RESPONSE=$(http_post "/banks" '{
    "id":"test-context-bank",
    "name":"Context Test Bank",
    "description":"Bank for testing context features",
    "context":"E-commerce checkout flow testing domain"
}')
STATUS=$(http_post_status "/banks" '{
    "id":"test-context-bank",
    "name":"Context Test Bank",
    "description":"Bank for testing context features",
    "context":"E-commerce checkout flow testing domain"
}')

if [ "$STATUS" == "200" ] || [ "$STATUS" == "201" ]; then
    print_pass "Create bank with context returns $STATUS"
else
    print_fail "Expected 200 or 201, got $STATUS"
fi

# T2.4: Create Bank (Duplicate)
print_test "T2.4: Create Bank (Duplicate)"
RESPONSE=$(http_post "/banks" '{"id":"test-minimal","name":"Duplicate Bank"}')
STATUS=$(http_post_status "/banks" '{"id":"test-minimal","name":"Duplicate Bank"}')

# Should return 200 with exists=true or 409 conflict
if [ "$STATUS" == "200" ] || [ "$STATUS" == "409" ]; then
    print_pass "Duplicate bank handled correctly (HTTP $STATUS)"
else
    print_fail "Expected 200 or 409 for duplicate, got $STATUS"
fi

# T2.5: Get Bank Details
print_test "T2.5: Get Bank Details"
RESPONSE=$(http_get "/banks/test-context-bank")
STATUS=$(http_get_status "/banks/test-context-bank")

assert_status "200" "$STATUS" "Get bank details returns 200"
assert_json_exists "$RESPONSE" ".id // .bankId" "Response includes bank id"

# Check if context is in response
CONTEXT=$(echo "$RESPONSE" | jq -r '.context // "not set"')
print_info "Bank context: $CONTEXT"

# T2.6: Get Non-Existent Bank
print_test "T2.6: Get Non-Existent Bank"
STATUS=$(http_get_status "/banks/non-existent-bank-12345")

assert_status "404" "$STATUS" "Non-existent bank returns 404"

# T2.7: Update Bank Context
print_test "T2.7: Update Bank Context"
RESPONSE=$(http_put "/banks/test-context-bank" '{"context":"Updated: Payment processing and validation domain"}')
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${BASE_URL}/banks/test-context-bank" \
    -H "Content-Type: application/json" \
    -d '{"context":"Updated: Payment processing and validation domain"}')

if [ "$STATUS" == "200" ] || [ "$STATUS" == "204" ]; then
    print_pass "Update bank context returns $STATUS"
else
    print_fail "Expected 200 or 204, got $STATUS"
fi

# T2.8: Verify Updated Context
print_test "T2.8: Verify Updated Context"
RESPONSE=$(http_get "/banks/test-context-bank")
CONTEXT=$(echo "$RESPONSE" | jq -r '.context // "not set"')

if [[ "$CONTEXT" == *"Updated"* ]] || [[ "$CONTEXT" == *"Payment"* ]]; then
    print_pass "Context was updated correctly"
    print_info "New context: $CONTEXT"
else
    print_fail "Context not updated as expected"
    print_info "Context: $CONTEXT"
fi

# T2.9: Delete Bank
print_test "T2.9: Delete Bank"
# Get status in single request (don't make two DELETE calls)
STATUS=$(http_delete_status "/banks/test-minimal")

if [ "$STATUS" == "200" ] || [ "$STATUS" == "204" ]; then
    print_pass "Delete bank returns $STATUS"
else
    print_fail "Expected 200 or 204, got $STATUS"
fi

# Verify deletion
VERIFY_STATUS=$(http_get_status "/banks/test-minimal")
if [ "$VERIFY_STATUS" == "404" ]; then
    print_info "Bank deletion verified (now returns 404)"
fi

# T2.10: Delete Non-Existent Bank
print_test "T2.10: Delete Non-Existent Bank"
STATUS=$(http_delete_status "/banks/non-existent-bank-12345")

if [ "$STATUS" == "404" ] || [ "$STATUS" == "204" ]; then
    print_pass "Delete non-existent bank handled (HTTP $STATUS)"
else
    print_fail "Expected 404 or 204, got $STATUS"
fi

# Print summary
print_summary "Bank Management Tests"
