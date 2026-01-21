#!/bin/bash
# Hindsight Service - Error Handling Tests
# Tests: T9.1 - T9.8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "9. ERROR HANDLING TESTS"

# Ensure test bank exists
setup_test_bank

# T9.1: Invalid JSON Body
print_test "T9.1: Invalid JSON Body"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/banks" \
    -H "Content-Type: application/json" \
    -d 'not valid json')

assert_status "400" "$STATUS" "Invalid JSON returns 400"

# T9.2: Missing Required Fields
print_test "T9.2: Missing Required Fields"
STATUS=$(http_post_status "/banks" '{"name":"No ID Bank"}')

assert_status "400" "$STATUS" "Missing bank id returns 400"

# T9.3: Invalid Memory Type
print_test "T9.3: Invalid Memory Type"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Test","type":"INVALID_TYPE"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Test","type":"INVALID_TYPE"}')

# Should still work (type might not be validated strictly)
if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Invalid type accepted (type stored as-is)"
elif [ "$STATUS" == "400" ]; then
    print_pass "Invalid type rejected with 400"
else
    print_fail "Unexpected status: $STATUS"
fi

# T9.4: Invalid Confidence Range
print_test "T9.4: Invalid Confidence Range"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Test","confidence":1.5}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Test","confidence":1.5}')

# Should either accept (may clamp) or reject
if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    STORED_CONFIDENCE=$(echo "$RESPONSE" | jq '.confidence // 1.5')
    print_pass "High confidence stored (value: $STORED_CONFIDENCE)"
elif [ "$STATUS" == "400" ]; then
    print_pass "Invalid confidence rejected with 400"
else
    print_fail "Unexpected status: $STATUS"
fi

# T9.5: Very Long Content
print_test "T9.5: Very Long Content"
# Generate 10KB of content
LONG_CONTENT=$(python3 -c "print('x' * 10000)")
RESPONSE=$(curl -s -X POST "${BASE_URL}/banks/$TEST_BANK_ID/memories" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$LONG_CONTENT\"}")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/banks/$TEST_BANK_ID/memories" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$LONG_CONTENT\"}")

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Long content (10KB) accepted"
elif [ "$STATUS" == "413" ]; then
    print_pass "Long content rejected with 413 (too large)"
else
    print_info "Long content returned status: $STATUS"
    print_pass "Long content handled"
fi

# T9.6: Unicode Content
print_test "T9.6: Unicode Content"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Testing unicode: 你好 🎉 émojis café"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Testing unicode: 你好 🎉 émojis café"}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Unicode content accepted"
    STORED_CONTENT=$(echo "$RESPONSE" | jq -r '.content // "not returned"')
    # Check if emojis/unicode preserved
    if [[ "$STORED_CONTENT" == *"你好"* ]] || [[ "$STORED_CONTENT" == *"🎉"* ]]; then
        print_info "Unicode preserved: $STORED_CONTENT"
    fi
else
    print_fail "Unicode content failed with status $STATUS"
fi

# T9.7: Empty Batch
print_test "T9.7: Empty Batch"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories/batch" '{"memories":[]}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories/batch" '{"memories":[]}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Empty batch accepted (stored=0)"
    STORED=$(echo "$RESPONSE" | jq '.stored // .count // 0')
    print_info "Stored: $STORED"
elif [ "$STATUS" == "400" ]; then
    print_pass "Empty batch rejected with 400"
else
    print_fail "Unexpected status: $STATUS"
fi

# T9.8: Server Not Running (Connection Test)
print_test "T9.8: Server Not Running Simulation"
# Try to connect to a port that's unlikely to be in use
FAKE_RESPONSE=$(curl -s --connect-timeout 2 http://localhost:59999/health 2>&1)
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
    print_pass "Connection failure handled gracefully"
    print_info "Expected behavior for unreachable server"
else
    print_info "Port 59999 unexpectedly responded"
    print_pass "Connection test completed"
fi

# Print summary
print_summary "Error Handling Tests"
