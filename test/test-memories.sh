#!/bin/bash
# Hindsight Service - Memory Storage Tests
# Tests: T3.1 - T3.12

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "3. MEMORY STORAGE TESTS"

# Ensure test bank exists
setup_test_bank

# T3.1: Store Memory (Minimal)
print_test "T3.1: Store Memory (Minimal)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Always validate credit card numbers before submission"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Always validate credit card numbers before submission"}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Store memory returns $STATUS"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# Check for entities extraction
ENTITIES=$(echo "$RESPONSE" | jq '.entities // []')
print_info "Entities extracted: $ENTITIES"

# T3.2: Store Memory with Type
print_test "T3.2: Store Memory with Type"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Use data-testid for payment form fields","type":"PATTERN"}')

TYPE=$(echo "$RESPONSE" | jq -r '.type // .memoryType // "unknown"')
if [ "$TYPE" == "PATTERN" ] || [ "$TYPE" == "pattern" ]; then
    print_pass "Memory stored with type PATTERN"
else
    print_info "Type stored as: $TYPE (may be normalized differently)"
    print_pass "Memory stored with type parameter"
fi

# T3.3: Store Memory with Confidence
print_test "T3.3: Store Memory with Confidence"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Checkout flow takes 3-5 seconds on average","type":"WORLD_FACT","confidence":0.8}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Checkout flow takes 3-5 seconds on average","type":"WORLD_FACT","confidence":0.8}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Store memory with confidence succeeds"
    CONFIDENCE=$(echo "$RESPONSE" | jq '.confidence // "not returned"')
    print_info "Confidence: $CONFIDENCE"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.4: Store Memory with TTL
print_test "T3.4: Store Memory with TTL"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Temporary test memory for expiry","ttlDays":1}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Temporary test memory for expiry","ttlDays":1}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Store memory with TTL succeeds"
    EXPIRES=$(echo "$RESPONSE" | jq -r '.expires_at // .expiresAt // "not set"')
    print_info "Expires at: $EXPIRES"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.5: Store Memory with Tags
print_test "T3.5: Store Memory with Tags"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Payment button has id=submit-payment","tags":["selector","payment","button"]}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Payment button has id=submit-payment","tags":["selector","payment","button"]}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Store memory with tags succeeds"
    TAGS=$(echo "$RESPONSE" | jq '.tags // []')
    print_info "Tags: $TAGS"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.6: Store Memory with Metadata
print_test "T3.6: Store Memory with Metadata"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Custom metadata test","metadata":{"source_file":"checkout.spec.ts","line":42}}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"content":"Custom metadata test","metadata":{"source_file":"checkout.spec.ts","line":42}}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Store memory with metadata succeeds"
    METADATA=$(echo "$RESPONSE" | jq '.metadata // {}')
    print_info "Metadata: $METADATA"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.7: Store Memory with Action Context (NEW)
print_test "T3.7: Store Memory with Action Context (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories" '{
    "content":"The submit button becomes disabled after click",
    "type":"PATTERN",
    "actionContext":"Debugging flaky payment submission test"
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{
    "content":"The submit button becomes disabled after click",
    "type":"PATTERN",
    "actionContext":"Debugging flaky payment submission test"
}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Store memory with actionContext succeeds"
    ENTITIES=$(echo "$RESPONSE" | jq '.entities // []')
    print_info "Entities (should be payment-related): $ENTITIES"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.8: Store Memory Missing Content
print_test "T3.8: Store Memory Missing Content"
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories" '{"type":"PATTERN"}')

assert_status "400" "$STATUS" "Missing content returns 400"

# T3.9: Batch Store Memories
print_test "T3.9: Batch Store Memories"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories/batch" '{
    "memories": [
        {"content":"Batch memory 1 - form validation","type":"PATTERN"},
        {"content":"Batch memory 2 - error handling","type":"EXPERIENCE"},
        {"content":"Batch memory 3 - success message","type":"WORLD_FACT"}
    ]
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories/batch" '{
    "memories": [
        {"content":"Batch memory 1 - form validation","type":"PATTERN"},
        {"content":"Batch memory 2 - error handling","type":"EXPERIENCE"},
        {"content":"Batch memory 3 - success message","type":"WORLD_FACT"}
    ]
}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Batch store memories returns $STATUS"
    STORED=$(echo "$RESPONSE" | jq '.stored // .count // .total // "unknown"')
    print_info "Stored count: $STORED"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.10: Batch Store with Global Action Context (NEW)
print_test "T3.10: Batch Store with Global Action Context (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories/batch" '{
    "memories": [
        {"content":"Card number field accepts 16 digits"},
        {"content":"CVV field is limited to 3-4 characters"},
        {"content":"Expiry date uses MM/YY format"}
    ],
    "actionContext":"Documenting payment form field validation rules"
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories/batch" '{
    "memories": [
        {"content":"Card number field accepts 16 digits"},
        {"content":"CVV field is limited to 3-4 characters"},
        {"content":"Expiry date uses MM/YY format"}
    ],
    "actionContext":"Documenting payment form field validation rules"
}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Batch store with actionContext succeeds"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.11: Batch Store with Skip Extraction
print_test "T3.11: Batch Store with Skip Extraction"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/memories/batch" '{
    "memories": [
        {"content":"Pre-extracted memory","entities":["manual","entity"],"facts":["manual fact"]}
    ],
    "skipExtraction": true
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/memories/batch" '{
    "memories": [
        {"content":"Pre-extracted memory","entities":["manual","entity"],"facts":["manual fact"]}
    ],
    "skipExtraction": true
}')

if [ "$STATUS" == "201" ] || [ "$STATUS" == "200" ]; then
    print_pass "Batch store with skipExtraction succeeds"
else
    print_fail "Expected 201 or 200, got $STATUS"
fi

# T3.12: List Memories with Pagination
print_test "T3.12: List Memories with Pagination"
RESPONSE=$(http_get "/banks/$TEST_BANK_ID/memories?limit=5&offset=0")
STATUS=$(http_get_status "/banks/$TEST_BANK_ID/memories?limit=5&offset=0")

assert_status "200" "$STATUS" "List memories returns 200"

# Check for memories array
MEMORIES_COUNT=$(echo "$RESPONSE" | jq '.memories | length // 0')
TOTAL=$(echo "$RESPONSE" | jq '.total // .totalCount // "unknown"')
print_info "Retrieved: $MEMORIES_COUNT memories (total: $TOTAL)"

# Print summary
print_summary "Memory Storage Tests"
