#!/bin/bash
# Hindsight Service Test Utilities
# Shared functions for all test scripts

# Configuration
export BASE_URL="${HINDSIGHT_URL:-http://localhost:8765}"
export TEST_BANK_ID="test-context-bank"
export TEST_BANK_MINIMAL="test-minimal"
export TEST_BANK_EMPTY="empty-bank"
export TEST_BANK_IMPORTED="imported-bank"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Print colored output
print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_test() {
    echo -e "\n${YELLOW}▶ $1${NC}"
}

print_pass() {
    echo -e "  ${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "  ${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

print_skip() {
    echo -e "  ${YELLOW}○ SKIP${NC}: $1"
    ((TESTS_SKIPPED++))
}

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# Check if server is running
check_server() {
    local response=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" 2>/dev/null)
    if [ "$response" != "200" ]; then
        echo -e "${RED}ERROR: Server is not running at ${BASE_URL}${NC}"
        echo "Please start the server first:"
        echo "  cd /Users/shantham/WIGTrade/hindsight-service && node src/server.js"
        exit 1
    fi
}

# Assert HTTP status code
assert_status() {
    local expected=$1
    local actual=$2
    local test_name=$3

    if [ "$expected" == "$actual" ]; then
        print_pass "$test_name (HTTP $actual)"
        return 0
    else
        print_fail "$test_name (Expected HTTP $expected, got $actual)"
        return 1
    fi
}

# Assert JSON field exists
assert_json_exists() {
    local json=$1
    local field=$2
    local test_name=$3

    local value=$(echo "$json" | jq -r "$field" 2>/dev/null)
    if [ "$value" != "null" ] && [ -n "$value" ]; then
        print_pass "$test_name (field $field exists)"
        return 0
    else
        print_fail "$test_name (field $field missing or null)"
        return 1
    fi
}

# Assert JSON field equals value
assert_json_equals() {
    local json=$1
    local field=$2
    local expected=$3
    local test_name=$4

    local actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
    if [ "$actual" == "$expected" ]; then
        print_pass "$test_name ($field = $expected)"
        return 0
    else
        print_fail "$test_name (Expected $field = $expected, got $actual)"
        return 1
    fi
}

# Assert JSON field is true
assert_json_true() {
    local json=$1
    local field=$2
    local test_name=$3

    local actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
    if [ "$actual" == "true" ]; then
        print_pass "$test_name ($field is true)"
        return 0
    else
        print_fail "$test_name (Expected $field = true, got $actual)"
        return 1
    fi
}

# Assert JSON array length
assert_json_array_length() {
    local json=$1
    local field=$2
    local min_length=$3
    local test_name=$4

    local actual=$(echo "$json" | jq "$field | length" 2>/dev/null)
    if [ "$actual" -ge "$min_length" ]; then
        print_pass "$test_name (length $actual >= $min_length)"
        return 0
    else
        print_fail "$test_name (Expected length >= $min_length, got $actual)"
        return 1
    fi
}

# Assert response time is under threshold (ms)
assert_time_under() {
    local start_ms=$1
    local end_ms=$2
    local threshold_ms=$3
    local test_name=$4

    local duration=$((end_ms - start_ms))
    if [ "$duration" -lt "$threshold_ms" ]; then
        print_pass "$test_name (${duration}ms < ${threshold_ms}ms)"
        return 0
    else
        print_fail "$test_name (${duration}ms >= ${threshold_ms}ms threshold)"
        return 1
    fi
}

# Get current time in milliseconds
now_ms() {
    python3 -c 'import time; print(int(time.time() * 1000))'
}

# HTTP helpers
http_get() {
    local endpoint=$1
    curl -s "${BASE_URL}${endpoint}"
}

http_get_status() {
    local endpoint=$1
    curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${endpoint}"
}

http_post() {
    local endpoint=$1
    local data=$2
    curl -s -X POST "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

http_post_status() {
    local endpoint=$1
    local data=$2
    curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

http_put() {
    local endpoint=$1
    local data=$2
    curl -s -X PUT "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

http_delete() {
    local endpoint=$1
    curl -s -X DELETE "${BASE_URL}${endpoint}"
}

http_delete_status() {
    local endpoint=$1
    curl -s -o /dev/null -w "%{http_code}" -X DELETE "${BASE_URL}${endpoint}"
}

# Setup test bank
setup_test_bank() {
    print_info "Setting up test bank: $TEST_BANK_ID"
    http_post "/banks" "{\"id\":\"$TEST_BANK_ID\",\"name\":\"Test Context Bank\",\"description\":\"Bank for testing\",\"context\":\"E-commerce checkout flow testing domain\"}" > /dev/null
}

# Cleanup test banks
cleanup_test_banks() {
    print_info "Cleaning up test banks..."
    http_delete "/banks/$TEST_BANK_ID" > /dev/null 2>&1
    http_delete "/banks/$TEST_BANK_MINIMAL" > /dev/null 2>&1
    http_delete "/banks/$TEST_BANK_EMPTY" > /dev/null 2>&1
    http_delete "/banks/$TEST_BANK_IMPORTED" > /dev/null 2>&1
}

# Print test summary
print_summary() {
    local category=$1
    echo ""
    echo -e "${BLUE}───────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${GREEN}Passed${NC}: $TESTS_PASSED"
    echo -e "  ${RED}Failed${NC}: $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped${NC}: $TESTS_SKIPPED"
    echo -e "${BLUE}───────────────────────────────────────────────────────────────${NC}"

    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "  ${RED}$category: FAILED${NC}"
        return 1
    else
        echo -e "  ${GREEN}$category: PASSED${NC}"
        return 0
    fi
}

# Reset counters
reset_counters() {
    TESTS_PASSED=0
    TESTS_FAILED=0
    TESTS_SKIPPED=0
}

# Export functions
export -f print_header print_test print_pass print_fail print_skip print_info
export -f check_server assert_status assert_json_exists assert_json_equals assert_json_true
export -f assert_json_array_length assert_time_under now_ms
export -f http_get http_get_status http_post http_post_status http_put http_delete http_delete_status
export -f setup_test_bank cleanup_test_banks print_summary reset_counters
