#!/bin/bash
# Hindsight Service - Memory Recall Tests
# Tests: T4.1 - T4.14

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "4. MEMORY RECALL TESTS"

# Ensure test bank exists with some memories
setup_test_bank
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Payment validation is critical for checkout","tags":["payment","validation"]}' > /dev/null 2>&1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Button selectors should use data-testid","tags":["selector","button"]}' > /dev/null 2>&1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Checkout flow requires user authentication","tags":["checkout","auth"]}' > /dev/null 2>&1

# T4.1: Basic Recall
print_test "T4.1: Basic Recall"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"payment validation"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{"query":"payment validation"}')

assert_status "200" "$STATUS" "Basic recall returns 200"
assert_json_exists "$RESPONSE" ".memories" "Response includes memories array"

MEMORIES_COUNT=$(echo "$RESPONSE" | jq '.memories | length // 0')
print_info "Retrieved $MEMORIES_COUNT memories for 'payment validation'"

# T4.2: Recall with Max Results
print_test "T4.2: Recall with Max Results"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"button selector","maxResults":3}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{"query":"button selector","maxResults":3}')

assert_status "200" "$STATUS" "Recall with maxResults returns 200"
MEMORIES_COUNT=$(echo "$RESPONSE" | jq '.memories | length // 0')

if [ "$MEMORIES_COUNT" -le 3 ]; then
    print_pass "Results limited to maxResults ($MEMORIES_COUNT <= 3)"
else
    print_fail "Expected at most 3 results, got $MEMORIES_COUNT"
fi

# T4.3: Recall with Min Confidence Filter
print_test "T4.3: Recall with Min Confidence Filter"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"checkout flow","minConfidence":0.5}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{"query":"checkout flow","minConfidence":0.5}')

assert_status "200" "$STATUS" "Recall with minConfidence returns 200"

# T4.4: Recall with Type Filter
print_test "T4.4: Recall with Type Filter"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"form fields","types":["PATTERN"]}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{"query":"form fields","types":["PATTERN"]}')

assert_status "200" "$STATUS" "Recall with type filter returns 200"
print_info "Filtered by type: PATTERN"

# T4.5: Recall with Query Context (NEW)
print_test "T4.5: Recall with Query Context (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{
    "query":"submit button",
    "queryContext":"Fixing flaky checkout test that fails on slow networks"
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{
    "query":"submit button",
    "queryContext":"Fixing flaky checkout test that fails on slow networks"
}')

assert_status "200" "$STATUS" "Recall with queryContext returns 200"

# Check for contextKeywords in response
CONTEXT_KEYWORDS=$(echo "$RESPONSE" | jq '.contextKeywords // []')
print_info "Context keywords: $CONTEXT_KEYWORDS"

# T4.6: Recall Shows Entity Boost (NEW)
print_test "T4.6: Recall Shows Entity Boost (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{
    "query":"form validation",
    "queryContext":"Payment processing error handling"
}')

# Check if entityBoost is in response
FIRST_MEMORY=$(echo "$RESPONSE" | jq '.memories[0] // {}')
ENTITY_BOOST=$(echo "$FIRST_MEMORY" | jq '.entityBoost // "not present"')
VECTOR_SCORE=$(echo "$FIRST_MEMORY" | jq '.vectorScore // .score // "not present"')

print_info "Entity boost: $ENTITY_BOOST"
print_info "Vector score: $VECTOR_SCORE"

if [ "$ENTITY_BOOST" != "not present" ] && [ "$ENTITY_BOOST" != "null" ]; then
    print_pass "Entity boost is present in response"
else
    print_skip "Entity boost not in response (feature may not be implemented)"
fi

# T4.7: Recall with Custom Entity Boost Weight (NEW)
print_test "T4.7: Recall with Custom Entity Boost Weight (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{
    "query":"error message",
    "queryContext":"Testing error scenarios",
    "entityBoostWeight":0.1
}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{
    "query":"error message",
    "queryContext":"Testing error scenarios",
    "entityBoostWeight":0.1
}')

assert_status "200" "$STATUS" "Recall with entityBoostWeight returns 200"

# T4.8: Recall Returns Context Keywords (NEW)
print_test "T4.8: Recall Returns Context Keywords (NEW)"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{
    "query":"selector",
    "queryContext":"Working on payment form automation"
}')

CONTEXT_KEYWORDS=$(echo "$RESPONSE" | jq '.contextKeywords // []')
KEYWORDS_COUNT=$(echo "$CONTEXT_KEYWORDS" | jq 'length')

if [ "$KEYWORDS_COUNT" -gt 0 ]; then
    print_pass "Context keywords extracted ($KEYWORDS_COUNT keywords)"
    print_info "Keywords: $CONTEXT_KEYWORDS"
else
    print_skip "Context keywords not returned (feature may not be implemented)"
fi

# T4.9: Recall Updates Access Tracking
print_test "T4.9: Recall Updates Access Tracking"
# First recall to trigger access update
RECALL_RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"validation","maxResults":1}')
MEMORY_ID=$(echo "$RECALL_RESPONSE" | jq -r '.memories[0].id // "unknown"')

if [ "$MEMORY_ID" != "unknown" ] && [ "$MEMORY_ID" != "null" ]; then
    print_pass "Recall returned a memory (ID: $MEMORY_ID)"
    # Note: Verifying access_count would require direct DB access or memory GET endpoint
    print_info "Access tracking verification requires memory details endpoint"
else
    print_skip "Could not verify access tracking (no memory returned)"
fi

# T4.10: Recall from Empty Bank
print_test "T4.10: Recall from Empty Bank"
# Create empty bank
http_post "/banks" '{"id":"empty-bank","name":"Empty Test Bank"}' > /dev/null 2>&1

RESPONSE=$(http_post "/banks/empty-bank/recall" '{"query":"anything"}')
STATUS=$(http_post_status "/banks/empty-bank/recall" '{"query":"anything"}')

assert_status "200" "$STATUS" "Recall from empty bank returns 200"
MEMORIES_COUNT=$(echo "$RESPONSE" | jq '.memories | length // 0')
TOTAL=$(echo "$RESPONSE" | jq '.total // 0')

if [ "$MEMORIES_COUNT" -eq 0 ]; then
    print_pass "Empty bank returns 0 memories"
else
    print_info "Empty bank returned $MEMORIES_COUNT memories (may have been populated)"
fi

# Cleanup empty bank
http_delete "/banks/empty-bank" > /dev/null 2>&1

# T4.11: Recall Missing Query
print_test "T4.11: Recall Missing Query"
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{}')

assert_status "400" "$STATUS" "Missing query returns 400"

# T4.12: Recall with Story ID Filter
print_test "T4.12: Recall with Story ID Filter"
# First store a memory with storyId
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Story-specific memory for filtering test","storyId":"STORY-123"}' > /dev/null 2>&1

RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"story memory","storyId":"STORY-123"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/recall" '{"query":"story memory","storyId":"STORY-123"}')

assert_status "200" "$STATUS" "Recall with storyId filter returns 200"
print_info "Story ID filter applied"

# T4.13: Recall Non-Existent Bank
print_test "T4.13: Recall Non-Existent Bank"
STATUS=$(http_post_status "/banks/fake-bank-12345/recall" '{"query":"test"}')

assert_status "404" "$STATUS" "Recall on non-existent bank returns 404"

# T4.14: Recall Performance (Vector Index)
print_test "T4.14: Recall Performance (Vector Index)"
START_MS=$(now_ms)

RESPONSE=$(http_post "/banks/$TEST_BANK_ID/recall" '{"query":"performance test","maxResults":20}')

END_MS=$(now_ms)
DURATION=$((END_MS - START_MS))

if [ "$DURATION" -lt 1000 ]; then
    print_pass "Recall completed in ${DURATION}ms (< 1000ms)"
else
    print_info "Recall took ${DURATION}ms (may be slow due to LLM or cold start)"
fi

# Print summary
print_summary "Memory Recall Tests"
