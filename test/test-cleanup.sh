#!/bin/bash
# Hindsight Service - Retention & Cleanup Tests
# Tests: T8.1 - T8.6

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "8. RETENTION & CLEANUP TESTS"

# Ensure test bank exists with memories
setup_test_bank

# Add some test memories with varying attributes
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Oldest memory for cleanup test","confidence":0.3}' > /dev/null 2>&1
sleep 1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Medium age memory","confidence":0.5}' > /dev/null 2>&1
sleep 1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Newest memory for cleanup test","confidence":0.9}' > /dev/null 2>&1

# T8.1: Cleanup Expired Memories
print_test "T8.1: Cleanup Expired Memories"
RESPONSE=$(http_post "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"expired"}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"expired"}')

if [ "$STATUS" == "200" ]; then
    print_pass "Cleanup expired returns 200"
    REMOVED=$(echo "$RESPONSE" | jq '.removed // .deleted // .count // 0')
    print_info "Removed: $REMOVED expired memories"
else
    print_fail "Expected 200, got $STATUS"
fi

# T8.2: Cleanup Oldest First
print_test "T8.2: Cleanup Oldest First"
# Get initial count
BEFORE_COUNT=$(http_get "/banks/$TEST_BANK_ID/memories" | jq '.total // .memories | length // 0')

RESPONSE=$(http_post "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"oldest_first","limit":2}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"oldest_first","limit":2}')

if [ "$STATUS" == "200" ]; then
    print_pass "Cleanup oldest_first returns 200"
    REMOVED=$(echo "$RESPONSE" | jq '.removed // .deleted // .count // 0')
    print_info "Removed: $REMOVED memories (limit was 2)"
else
    print_fail "Expected 200, got $STATUS"
fi

# T8.3: Cleanup Lowest Confidence
print_test "T8.3: Cleanup Lowest Confidence"
# Add more test memories with low confidence
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Low confidence memory 1","confidence":0.1}' > /dev/null 2>&1
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Low confidence memory 2","confidence":0.2}' > /dev/null 2>&1

RESPONSE=$(http_post "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"lowest_confidence","limit":2}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"lowest_confidence","limit":2}')

if [ "$STATUS" == "200" ]; then
    print_pass "Cleanup lowest_confidence returns 200"
    REMOVED=$(echo "$RESPONSE" | jq '.removed // .deleted // .count // 0')
    print_info "Removed: $REMOVED low confidence memories"
else
    print_fail "Expected 200, got $STATUS"
fi

# T8.4: Cleanup Dry Run
print_test "T8.4: Cleanup Dry Run"
# Get count before
BEFORE_COUNT=$(http_get "/banks/$TEST_BANK_ID/memories?limit=1000" | jq '.total // (.memories | length) // 0')

RESPONSE=$(http_post "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"oldest_first","limit":5,"dryRun":true}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"oldest_first","limit":5,"dryRun":true}')

# Get count after
AFTER_COUNT=$(http_get "/banks/$TEST_BANK_ID/memories?limit=1000" | jq '.total // (.memories | length) // 0')

if [ "$STATUS" == "200" ]; then
    print_pass "Cleanup dry run returns 200"

    if [ "$BEFORE_COUNT" -eq "$AFTER_COUNT" ]; then
        print_pass "Dry run did not delete any memories ($BEFORE_COUNT -> $AFTER_COUNT)"
    else
        print_fail "Dry run should not delete memories ($BEFORE_COUNT -> $AFTER_COUNT)"
    fi

    WOULD_REMOVE=$(echo "$RESPONSE" | jq '.wouldRemove // .removed // 0')
    print_info "Would remove: $WOULD_REMOVE memories"
else
    print_fail "Expected 200, got $STATUS"
fi

# T8.5: Cleanup Unknown Strategy
print_test "T8.5: Cleanup Unknown Strategy"
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"invalid_strategy"}')

assert_status "400" "$STATUS" "Unknown strategy returns 400"

# T8.6: Cleanup Least Accessed
print_test "T8.6: Cleanup Least Accessed"
# Add memories and access some
http_post "/banks/$TEST_BANK_ID/memories" '{"content":"Rarely accessed memory for test"}' > /dev/null 2>&1

# Access some memories via recall to increase their access count
http_post "/banks/$TEST_BANK_ID/recall" '{"query":"cleanup test","maxResults":5}' > /dev/null 2>&1

RESPONSE=$(http_post "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"least_accessed","limit":2}')
STATUS=$(http_post_status "/banks/$TEST_BANK_ID/cleanup" '{"strategy":"least_accessed","limit":2}')

if [ "$STATUS" == "200" ]; then
    print_pass "Cleanup least_accessed returns 200"
    REMOVED=$(echo "$RESPONSE" | jq '.removed // .deleted // .count // 0')
    print_info "Removed: $REMOVED least accessed memories"
else
    print_fail "Expected 200, got $STATUS"
fi

# Print summary
print_summary "Retention & Cleanup Tests"
