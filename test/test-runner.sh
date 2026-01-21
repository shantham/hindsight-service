#!/bin/bash
# Hindsight Service Test Runner
# Runs all test categories in sequence

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source utilities
source "${SCRIPT_DIR}/utils.sh"

# Parse arguments
RUN_ALL=true
CATEGORIES=()
CLEANUP_ONLY=false
SKIP_CLEANUP=false

print_usage() {
    echo "Usage: $0 [OPTIONS] [CATEGORIES...]"
    echo ""
    echo "Options:"
    echo "  -h, --help        Show this help message"
    echo "  -c, --cleanup     Only run cleanup (delete test banks)"
    echo "  -s, --skip-cleanup Skip cleanup after tests"
    echo "  -l, --list        List available test categories"
    echo ""
    echo "Categories:"
    echo "  health      Health & stats tests (4 tests)"
    echo "  banks       Bank management tests (10 tests)"
    echo "  memories    Memory storage tests (12 tests)"
    echo "  recall      Memory recall tests (14 tests)"
    echo "  context     Context features tests (10 tests)"
    echo "  reflect     Reflection tests (4 tests)"
    echo "  export      Export/import tests (6 tests)"
    echo "  cleanup     Retention cleanup tests (6 tests)"
    echo "  errors      Error handling tests (8 tests)"
    echo ""
    echo "Examples:"
    echo "  $0                    Run all tests"
    echo "  $0 health banks       Run only health and banks tests"
    echo "  $0 -c                 Only cleanup test data"
    echo "  $0 -s recall          Run recall tests without cleanup"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_usage
            exit 0
            ;;
        -c|--cleanup)
            CLEANUP_ONLY=true
            shift
            ;;
        -s|--skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        -l|--list)
            echo "Available test categories:"
            echo "  health, banks, memories, recall, context, reflect, export, cleanup, errors"
            exit 0
            ;;
        *)
            RUN_ALL=false
            CATEGORIES+=("$1")
            shift
            ;;
    esac
done

# Banner
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       HINDSIGHT SERVICE v2.1 - TEST SUITE                     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check jq
if ! command -v jq &> /dev/null; then
    echo -e "${RED}ERROR: jq is required but not installed.${NC}"
    echo "Install with: brew install jq"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} jq installed"

# Check curl
if ! command -v curl &> /dev/null; then
    echo -e "${RED}ERROR: curl is required but not installed.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} curl installed"

# Check server
check_server
echo -e "  ${GREEN}✓${NC} Server running at ${BASE_URL}"

# Cleanup only mode
if [ "$CLEANUP_ONLY" = true ]; then
    print_header "CLEANUP MODE"
    cleanup_test_banks
    echo -e "${GREEN}Cleanup complete!${NC}"
    exit 0
fi

# Track overall results
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
FAILED_CATEGORIES=()

# Run a test category
run_category() {
    local category=$1
    local script="${SCRIPT_DIR}/test-${category}.sh"

    if [ -f "$script" ]; then
        echo ""
        bash "$script"
        local exit_code=$?

        # Aggregate results
        TOTAL_PASSED=$((TOTAL_PASSED + TESTS_PASSED))
        TOTAL_FAILED=$((TOTAL_FAILED + TESTS_FAILED))
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + TESTS_SKIPPED))

        if [ $exit_code -ne 0 ]; then
            FAILED_CATEGORIES+=("$category")
        fi

        reset_counters
    else
        echo -e "${YELLOW}Warning: Test script not found: $script${NC}"
    fi
}

# Run tests
if [ "$RUN_ALL" = true ]; then
    CATEGORIES=("health" "banks" "memories" "recall" "context" "reflect" "export" "cleanup" "errors")
fi

echo ""
echo -e "${YELLOW}Running test categories: ${CATEGORIES[*]}${NC}"

for category in "${CATEGORIES[@]}"; do
    run_category "$category"
done

# Cleanup unless skipped
if [ "$SKIP_CLEANUP" = false ]; then
    print_header "CLEANUP"
    cleanup_test_banks
fi

# Final summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    FINAL TEST SUMMARY                         ║${NC}"
echo -e "${BLUE}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}Passed${NC}:  $(printf '%3d' $TOTAL_PASSED)                                            ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  ${RED}Failed${NC}:  $(printf '%3d' $TOTAL_FAILED)                                            ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  ${YELLOW}Skipped${NC}: $(printf '%3d' $TOTAL_SKIPPED)                                            ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  Total:   $(printf '%3d' $((TOTAL_PASSED + TOTAL_FAILED + TOTAL_SKIPPED)))                                            ${BLUE}║${NC}"
echo -e "${BLUE}╠═══════════════════════════════════════════════════════════════╣${NC}"

if [ ${#FAILED_CATEGORIES[@]} -gt 0 ]; then
    echo -e "${BLUE}║${NC}  ${RED}FAILED CATEGORIES: ${FAILED_CATEGORIES[*]}${NC}"
    echo -e "${BLUE}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BLUE}║${NC}              ${RED}❌ TEST SUITE FAILED${NC}                          ${BLUE}║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    exit 1
else
    echo -e "${BLUE}║${NC}              ${GREEN}✅ ALL TESTS PASSED${NC}                          ${BLUE}║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
