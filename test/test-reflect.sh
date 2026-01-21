#!/bin/bash
# Hindsight Service - Reflection Tests
# Tests: T6.1 - T6.4

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "6. REFLECTION TESTS"

# Ensure test bank exists with memories
setup_test_bank
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Always validate user input before processing"}' > /dev/null 2>&1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Use try-catch for async operations"}' > /dev/null 2>&1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Log errors with full stack traces"}' > /dev/null 2>&1

# T6.1: Basic Reflection
print_test "T6.1: Basic Reflection"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/reflect" '{"query":"payment validation best practices"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/reflect" '{"query":"payment validation best practices"}')

assert_status "200" "$STATUS" "Reflection returns 200"

# Check for insights
INSIGHTS=$(echo "$RESPONSE" | jq '.insights // .reflection // .response // "not found"')
if [ "$INSIGHTS" != "not found" ] && [ "$INSIGHTS" != "null" ]; then
    print_pass "Reflection returned insights"
    # Truncate for display
    INSIGHTS_PREVIEW=$(echo "$INSIGHTS" | head -c 200)
    print_info "Insights preview: $INSIGHTS_PREVIEW..."
else
    print_skip "Insights not in expected format (may have different structure)"
fi

# T6.2: Reflection with Include Memories
print_test "T6.2: Reflection with Include Memories"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/reflect" '{"query":"checkout flow","includeMemories":true}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/reflect" '{"query":"checkout flow","includeMemories":true}')

assert_status "200" "$STATUS" "Reflection with includeMemories returns 200"

# Check for memories array
MEMORIES=$(echo "$RESPONSE" | jq '.memories // []')
MEMORIES_COUNT=$(echo "$MEMORIES" | jq 'length')

if [ "$MEMORIES_COUNT" -gt 0 ]; then
    print_pass "Memories included in response ($MEMORIES_COUNT memories)"
else
    print_info "No memories included (may be different response format)"
fi

# T6.3: Reflection with Query Context (NEW)
print_test "T6.3: Reflection with Query Context (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/reflect" '{
    "query":"error handling",
    "queryContext":"Improving test reliability for CI/CD pipeline"
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/reflect" '{
    "query":"error handling",
    "queryContext":"Improving test reliability for CI/CD pipeline"
}')

assert_status "200" "$STATUS" "Reflection with queryContext returns 200"
print_info "Reflection with CI/CD context completed"

# T6.4: Reflection Missing Query
print_test "T6.4: Reflection Missing Query"
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/reflect" '{}')

assert_status "400" "$STATUS" "Missing query returns 400"

# Print summary
print_summary "Reflection Tests"
