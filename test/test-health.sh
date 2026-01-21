#!/bin/bash
# Hindsight Service - Health & Stats Tests
# Tests: T1.1 - T1.4

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

print_header "1. HEALTH & STATS TESTS"

# T1.1: Health Check
print_test "T1.1: Health Check"
RESPONSE=$(http_get "/health")
STATUS=$(http_get_status "/health")

assert_status "200" "$STATUS" "Health endpoint returns 200"
assert_json_exists "$RESPONSE" ".version" "Response includes version"

VERSION=$(echo "$RESPONSE" | jq -r '.version')
print_info "Server version: $VERSION"

# T1.2: Health Shows LLM Persistent Mode
print_test "T1.2: Health Shows LLM Persistent Mode"
LLM_INFO=$(echo "$RESPONSE" | jq '.providers.llm // .llm // empty')

if [ -n "$LLM_INFO" ]; then
    assert_json_exists "$RESPONSE" ".providers.llm.state // .llm.state" "LLM state exists"
    LLM_STATE=$(echo "$RESPONSE" | jq -r '.providers.llm.state // .llm.state // "unknown"')
    print_info "LLM state: $LLM_STATE"

    LLM_MODE=$(echo "$RESPONSE" | jq -r '.providers.llm.mode // .llm.mode // "unknown"')
    print_info "LLM mode: $LLM_MODE"
else
    print_skip "LLM provider info not in health response (may be v1 format)"
fi

# T1.3: Health Shows Vector Index Stats
print_test "T1.3: Health Shows Vector Index Stats"
VECTOR_INFO=$(echo "$RESPONSE" | jq '.providers.vectorIndex // .vectorIndex // empty')

if [ -n "$VECTOR_INFO" ]; then
    assert_json_exists "$RESPONSE" ".providers.vectorIndex.initialized // .vectorIndex.initialized" "Vector index initialized field exists"
    VECTOR_INIT=$(echo "$RESPONSE" | jq -r '.providers.vectorIndex.initialized // .vectorIndex.initialized // "unknown"')
    print_info "Vector index initialized: $VECTOR_INIT"
else
    print_skip "Vector index info not in health response (may be different structure)"
fi

# T1.4: Global Stats
print_test "T1.4: Global Stats"
STATS_STATUS=$(http_get_status "/stats")
STATS=$(http_get "/stats")

assert_status "200" "$STATS_STATUS" "Stats endpoint returns 200"

# Check for banks count
BANKS_COUNT=$(echo "$STATS" | jq '.banks // .banksCount // .totalBanks // 0')
print_info "Banks count: $BANKS_COUNT"

# Check for memories count
MEMORIES_COUNT=$(echo "$STATS" | jq '.memories // .memoriesCount // .totalMemories // 0')
print_info "Memories count: $MEMORIES_COUNT"

# Print summary
print_summary "Health & Stats Tests"
