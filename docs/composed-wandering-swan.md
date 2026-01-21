# Hindsight Service - Comprehensive Test Plan

## Overview

This test plan covers all functionality of the Hindsight Service v2.1, including new features: actionContext, queryContext, entity boost, and persistent LLM provider.

---

## Test Categories

| Category | Tests | Priority |
|----------|-------|----------|
| 1. Health & Stats | 4 | HIGH |
| 2. Bank Management | 10 | HIGH |
| 3. Memory Storage | 12 | HIGH |
| 4. Memory Recall | 14 | HIGH |
| 5. Context Features (NEW) | 10 | HIGH |
| 6. Reflection | 4 | MEDIUM |
| 7. Export/Import | 6 | MEDIUM |
| 8. Retention & Cleanup | 6 | MEDIUM |
| 9. Error Handling | 8 | HIGH |
| 10. Performance | 4 | LOW |
| **Total** | **78** | |

---

## Test Plan Location

```
/Users/shantham/WIGTrade/hindsight-service/
├── docs/
│   └── TEST-PLAN.md          # This plan
├── test/
│   ├── test-runner.sh        # Main test runner script
│   ├── test-health.sh        # Health & stats tests
│   ├── test-banks.sh         # Bank management tests
│   ├── test-memories.sh      # Memory storage tests
│   ├── test-recall.sh        # Memory recall tests
│   ├── test-context.sh       # NEW: Context features tests
│   ├── test-reflect.sh       # Reflection tests
│   ├── test-export-import.sh # Export/import tests
│   ├── test-cleanup.sh       # Retention cleanup tests
│   └── test-errors.sh        # Error handling tests
└── package.json              # Add test script
```

---

## 1. Health & Stats Tests

### T1.1: Health Check
```bash
# GET /health
# Expected: 200, version=2.1.0, providers.llm.state=READY
curl -s http://localhost:8765/health | jq '.'
```

### T1.2: Health Shows LLM Persistent Mode
```bash
# Verify LLM provider shows persistent mode with PID
curl -s http://localhost:8765/health | jq '.providers.llm'
# Expected: mode=persistent, state=READY, pid!=null
```

### T1.3: Health Shows Vector Index Stats
```bash
# Verify vector index is initialized
curl -s http://localhost:8765/health | jq '.providers.vectorIndex'
# Expected: initialized=true, vectorCount > 0
```

### T1.4: Global Stats
```bash
# GET /stats
curl -s http://localhost:8765/stats | jq '.'
# Expected: banks count, memories count, type breakdown
```

---

## 2. Bank Management Tests

### T2.1: List Banks
```bash
# GET /banks
curl -s http://localhost:8765/banks | jq '.'
# Expected: 200, array of banks
```

### T2.2: Create Bank (Minimal)
```bash
# POST /banks with required fields only
curl -s -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{"id":"test-minimal","name":"Minimal Bank"}' | jq '.'
# Expected: 201, created=true
```

### T2.3: Create Bank with Context
```bash
# POST /banks with domain context
curl -s -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{
    "id":"test-context-bank",
    "name":"Context Test Bank",
    "description":"Bank for testing context features",
    "context":"E-commerce checkout flow testing domain"
  }' | jq '.'
# Expected: 201, created=true
```

### T2.4: Create Bank (Duplicate)
```bash
# POST /banks with existing ID
curl -s -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{"id":"test-minimal","name":"Duplicate Bank"}' | jq '.'
# Expected: 200, exists=true
```

### T2.5: Get Bank Details
```bash
# GET /banks/:id
curl -s http://localhost:8765/banks/test-context-bank | jq '.'
# Expected: 200, includes context field
```

### T2.6: Get Non-Existent Bank
```bash
# GET /banks/:id with bad ID
curl -s -w "\n%{http_code}" http://localhost:8765/banks/non-existent
# Expected: 404
```

### T2.7: Update Bank Context
```bash
# PUT /banks/:id
curl -s -X PUT http://localhost:8765/banks/test-context-bank \
  -H "Content-Type: application/json" \
  -d '{"context":"Updated: Payment processing and validation domain"}' | jq '.'
# Expected: 200, updated=true
```

### T2.8: Verify Updated Context
```bash
# GET /banks/:id and check context
curl -s http://localhost:8765/banks/test-context-bank | jq '.context'
# Expected: "Updated: Payment processing and validation domain"
```

### T2.9: Delete Bank
```bash
# DELETE /banks/:id
curl -s -X DELETE http://localhost:8765/banks/test-minimal | jq '.'
# Expected: 200, deleted=true
```

### T2.10: Delete Non-Existent Bank
```bash
# DELETE /banks/:id with bad ID
curl -s -w "\n%{http_code}" -X DELETE http://localhost:8765/banks/non-existent
# Expected: 404
```

---

## 3. Memory Storage Tests

### T3.1: Store Memory (Minimal)
```bash
# POST /banks/:id/memories with content only
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Always validate credit card numbers before submission"}' | jq '.'
# Expected: 201, stored=true, entities extracted, facts extracted
```

### T3.2: Store Memory with Type
```bash
# POST with specific type
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Use data-testid for payment form fields","type":"PATTERN"}' | jq '.'
# Expected: 201, type=PATTERN in storage
```

### T3.3: Store Memory with Confidence
```bash
# POST with confidence score
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Checkout flow takes 3-5 seconds on average","type":"WORLD_FACT","confidence":0.8}' | jq '.'
# Expected: 201, confidence stored
```

### T3.4: Store Memory with TTL
```bash
# POST with ttlDays
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Temporary test memory for expiry","ttlDays":1}' | jq '.'
# Expected: 201, expires_at set
```

### T3.5: Store Memory with Tags
```bash
# POST with tags array
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Payment button has id=submit-payment","tags":["selector","payment","button"]}' | jq '.'
# Expected: 201, tags stored
```

### T3.6: Store Memory with Metadata
```bash
# POST with custom metadata
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Custom metadata test","metadata":{"source_file":"checkout.spec.ts","line":42}}' | jq '.'
# Expected: 201, metadata stored
```

### T3.7: Store Memory with Action Context (NEW)
```bash
# POST with actionContext for enhanced extraction
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{
    "content":"The submit button becomes disabled after click",
    "type":"PATTERN",
    "actionContext":"Debugging flaky payment submission test"
  }' | jq '.'
# Expected: 201, entities relevant to payment/submission context
```

### T3.8: Store Memory Missing Content
```bash
# POST without content (error case)
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"type":"PATTERN"}'
# Expected: 400
```

### T3.9: Batch Store Memories
```bash
# POST /banks/:id/memories/batch
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content":"Batch memory 1 - form validation","type":"PATTERN"},
      {"content":"Batch memory 2 - error handling","type":"EXPERIENCE"},
      {"content":"Batch memory 3 - success message","type":"WORLD_FACT"}
    ]
  }' | jq '.'
# Expected: 201, stored=3
```

### T3.10: Batch Store with Global Action Context (NEW)
```bash
# POST batch with shared actionContext
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content":"Card number field accepts 16 digits"},
      {"content":"CVV field is limited to 3-4 characters"},
      {"content":"Expiry date uses MM/YY format"}
    ],
    "actionContext":"Documenting payment form field validation rules"
  }' | jq '.'
# Expected: 201, stored=3, entities related to payment/validation
```

### T3.11: Batch Store with Skip Extraction
```bash
# POST batch without LLM extraction
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content":"Pre-extracted memory","entities":["manual","entity"],"facts":["manual fact"]}
    ],
    "skipExtraction": true
  }' | jq '.'
# Expected: 201, entities=["manual","entity"]
```

### T3.12: List Memories with Pagination
```bash
# GET /banks/:id/memories with limit/offset
curl -s "http://localhost:8765/banks/test-context-bank/memories?limit=5&offset=0" | jq '.'
# Expected: 200, up to 5 memories, total count
```

---

## 4. Memory Recall Tests

### T4.1: Basic Recall
```bash
# POST /banks/:id/recall
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"payment validation"}' | jq '.'
# Expected: 200, memories array with scores
```

### T4.2: Recall with Max Results
```bash
# POST recall with maxResults
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"button selector","maxResults":3}' | jq '.'
# Expected: 200, at most 3 results
```

### T4.3: Recall with Min Confidence Filter
```bash
# POST recall with minConfidence
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"checkout flow","minConfidence":0.5}' | jq '.'
# Expected: 200, only memories with confidence >= 0.5
```

### T4.4: Recall with Type Filter
```bash
# POST recall filtering by types
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"form fields","types":["PATTERN"]}' | jq '.'
# Expected: 200, only PATTERN type memories
```

### T4.5: Recall with Query Context (NEW - Option A)
```bash
# POST recall with queryContext for enhanced embedding
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"submit button",
    "queryContext":"Fixing flaky checkout test that fails on slow networks"
  }' | jq '.'
# Expected: 200, queryContext in response, contextKeywords extracted
```

### T4.6: Recall Shows Entity Boost (NEW - Option B)
```bash
# POST recall and verify entity boost is applied
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"form validation",
    "queryContext":"Payment processing error handling"
  }' | jq '.memories[] | {content, score, vectorScore, entityBoost}'
# Expected: 200, memories show vectorScore + entityBoost = score
```

### T4.7: Recall with Custom Entity Boost Weight (NEW)
```bash
# POST recall with custom entityBoostWeight
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"error message",
    "queryContext":"Testing error scenarios",
    "entityBoostWeight":0.1
  }' | jq '.'
# Expected: 200, higher entity boost values
```

### T4.8: Recall Returns Context Keywords (NEW)
```bash
# Verify contextKeywords in response
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"selector",
    "queryContext":"Working on payment form automation"
  }' | jq '.contextKeywords'
# Expected: ["payment", "form", "automation"] (stop words filtered)
```

### T4.9: Recall Updates Access Tracking
```bash
# Recall and verify access_count incremented
MEMORY_ID=$(curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"validation","maxResults":1}' | jq -r '.memories[0].id')

curl -s "http://localhost:8765/banks/test-context-bank/memories?limit=100" | \
  jq ".memories[] | select(.id==\"$MEMORY_ID\") | {id, access_count, last_accessed_at}"
# Expected: access_count > 0, last_accessed_at set
```

### T4.10: Recall from Empty Bank
```bash
# Create empty bank and recall
curl -s -X POST http://localhost:8765/banks -H "Content-Type: application/json" -d '{"id":"empty-bank","name":"Empty"}'
curl -s -X POST http://localhost:8765/banks/empty-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"anything"}' | jq '.'
# Expected: 200, memories=[], total=0
```

### T4.11: Recall Missing Query
```bash
# POST recall without query (error)
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400
```

### T4.12: Recall with Story ID Filter
```bash
# Store memory with storyId, then recall filtering by it
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Story-specific memory","storyId":"STORY-123"}'

curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"story memory","storyId":"STORY-123"}' | jq '.'
# Expected: 200, only memories with storyId=STORY-123
```

### T4.13: Recall Non-Existent Bank
```bash
# POST recall to non-existent bank
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks/fake-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
# Expected: 404
```

### T4.14: Recall Performance (Vector Index)
```bash
# Time a recall to verify vector index is being used
time curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"performance test","maxResults":20}'
# Expected: < 100ms for small dataset
```

---

## 5. Context Features Tests (NEW)

### T5.1: Bank Context Used in Extraction
```bash
# Store memory in bank with context, verify extraction quality
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"The CVC field shows error for invalid input"}' | jq '.entities'
# Expected: entities related to payment (CVC is credit card term)
```

### T5.2: Action Context Overrides Bank Context
```bash
# Store with actionContext that differs from bank context
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{
    "content":"The login button is disabled until fields are valid",
    "actionContext":"Testing authentication flow"
  }' | jq '.entities'
# Expected: entities related to authentication, not payment
```

### T5.3: Query Context Enhances Search Relevance
```bash
# Store multiple memories, search with context
# Memory about "button" in payment context
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Submit button triggers payment API call","tags":["payment"]}'

# Memory about "button" in login context
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Login button redirects to OAuth flow","tags":["auth"]}'

# Search with payment context - should rank payment button higher
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"button",
    "queryContext":"Working on payment submission flow"
  }' | jq '.memories[] | {content, score, entityBoost}'
# Expected: payment button has higher entityBoost
```

### T5.4: Entity Boost Calculation
```bash
# Verify entity boost formula
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"selector",
    "queryContext":"payment form testing"
  }' | jq '.memories[0] | {score, vectorScore, entityBoost, check: (.vectorScore + .entityBoost == .score)}'
# Expected: check=true (score = vectorScore + entityBoost)
```

### T5.5: Context Keywords Extraction
```bash
# Verify stop words are filtered from context
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"test",
    "queryContext":"Working on the payment form with validation"
  }' | jq '.contextKeywords'
# Expected: ["working", "payment", "form", "validation"] (no "on", "the", "with")
```

### T5.6: No Context - No Entity Boost
```bash
# Recall without queryContext - entityBoost should be 0
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"validation"}' | jq '.memories[0].entityBoost'
# Expected: 0 or null
```

### T5.7: Context in Batch Storage
```bash
# Per-memory actionContext overrides global
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content":"Memory with global context"},
      {"content":"Memory with override","actionContext":"Authentication testing"}
    ],
    "actionContext":"Payment testing"
  }' | jq '.'
# Expected: First memory entities ~ payment, second ~ authentication
```

### T5.8: Bank Context Persists Across Restarts
```bash
# Get bank context, restart server, verify still there
CONTEXT=$(curl -s http://localhost:8765/banks/test-context-bank | jq -r '.context')
# (restart server)
curl -s http://localhost:8765/banks/test-context-bank | jq -r '.context'
# Expected: Same context value
```

### T5.9: Empty Context Handling
```bash
# Recall with empty string context
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"test","queryContext":""}' | jq '.contextKeywords'
# Expected: [] or null (no keywords)
```

### T5.10: Special Characters in Context
```bash
# Context with special characters
curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query":"test",
    "queryContext":"Testing <script>alert(1)</script> & \"edge\" cases"
  }' | jq '.'
# Expected: 200, no errors, keywords extracted safely
```

---

## 6. Reflection Tests

### T6.1: Basic Reflection
```bash
# POST /banks/:id/reflect
curl -s -X POST http://localhost:8765/banks/test-context-bank/reflect \
  -H "Content-Type: application/json" \
  -d '{"query":"payment validation best practices"}' | jq '.'
# Expected: 200, insights array
```

### T6.2: Reflection with Include Memories
```bash
# POST reflect with includeMemories=true
curl -s -X POST http://localhost:8765/banks/test-context-bank/reflect \
  -H "Content-Type: application/json" \
  -d '{"query":"checkout flow","includeMemories":true}' | jq '.'
# Expected: 200, memories array included
```

### T6.3: Reflection with Query Context (NEW)
```bash
# POST reflect with queryContext
curl -s -X POST http://localhost:8765/banks/test-context-bank/reflect \
  -H "Content-Type: application/json" \
  -d '{
    "query":"error handling",
    "queryContext":"Improving test reliability for CI/CD pipeline"
  }' | jq '.'
# Expected: 200, insights relevant to CI/CD context
```

### T6.4: Reflection Missing Query
```bash
# POST reflect without query (error)
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks/test-context-bank/reflect \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400
```

---

## 7. Export/Import Tests

### T7.1: Export Bank
```bash
# GET /banks/:id/export
curl -s http://localhost:8765/banks/test-context-bank/export | jq '.bank, .memories | length'
# Expected: 200, bank object, memories array
```

### T7.2: Export Includes Embeddings
```bash
# Verify embeddings are included
curl -s http://localhost:8765/banks/test-context-bank/export | jq '.memories[0].embedding | length'
# Expected: 384 (embedding dimensions)
```

### T7.3: Export Non-Existent Bank
```bash
# GET export for non-existent bank
curl -s -w "\n%{http_code}" http://localhost:8765/banks/fake-bank/export
# Expected: 404
```

### T7.4: Import Bank (New)
```bash
# Export then import to new bank
EXPORT=$(curl -s http://localhost:8765/banks/test-context-bank/export)
curl -s -X POST http://localhost:8765/banks/imported-bank/import \
  -H "Content-Type: application/json" \
  -d "{\"data\": $EXPORT}" | jq '.'
# Expected: 200, imported count matches export
```

### T7.5: Import Bank (Merge)
```bash
# Import with merge=true
curl -s -X POST http://localhost:8765/banks/imported-bank/import \
  -H "Content-Type: application/json" \
  -d "{\"data\": $EXPORT, \"merge\": true}" | jq '.'
# Expected: 200, merge=true
```

### T7.6: Import Missing Data
```bash
# POST import without data (error)
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks/test-bank/import \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400
```

---

## 8. Retention & Cleanup Tests

### T8.1: Cleanup Expired Memories
```bash
# Create memory with past expiry, then cleanup
# (Would need to manually set expires_at in past via direct DB or wait)
curl -s -X POST http://localhost:8765/banks/test-context-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{"strategy":"expired"}' | jq '.'
# Expected: 200, removed count
```

### T8.2: Cleanup Oldest First
```bash
# POST cleanup with oldest_first strategy
curl -s -X POST http://localhost:8765/banks/test-context-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{"strategy":"oldest_first","limit":2}' | jq '.'
# Expected: 200, removed <= 2
```

### T8.3: Cleanup Lowest Confidence
```bash
# POST cleanup with lowest_confidence strategy
curl -s -X POST http://localhost:8765/banks/test-context-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{"strategy":"lowest_confidence","limit":2}' | jq '.'
# Expected: 200, removed lowest confidence memories
```

### T8.4: Cleanup Dry Run
```bash
# POST cleanup with dryRun=true
BEFORE=$(curl -s "http://localhost:8765/banks/test-context-bank/memories" | jq '.total')
curl -s -X POST http://localhost:8765/banks/test-context-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{"strategy":"oldest_first","limit":5,"dryRun":true}' | jq '.'
AFTER=$(curl -s "http://localhost:8765/banks/test-context-bank/memories" | jq '.total')
# Expected: BEFORE == AFTER (no actual deletion)
```

### T8.5: Cleanup Unknown Strategy
```bash
# POST cleanup with invalid strategy
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks/test-context-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{"strategy":"invalid_strategy"}'
# Expected: 400
```

### T8.6: Cleanup Least Accessed
```bash
# POST cleanup with least_accessed strategy
curl -s -X POST http://localhost:8765/banks/test-context-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{"strategy":"least_accessed","limit":2}' | jq '.'
# Expected: 200, removed least accessed memories
```

---

## 9. Error Handling Tests

### T9.1: Invalid JSON Body
```bash
# POST with malformed JSON
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d 'not valid json'
# Expected: 400
```

### T9.2: Missing Required Fields
```bash
# POST bank without id
curl -s -w "\n%{http_code}" -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{"name":"No ID Bank"}'
# Expected: 400
```

### T9.3: Invalid Memory Type
```bash
# POST memory with invalid type (should still work, just stores as-is)
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Test","type":"INVALID_TYPE"}' | jq '.'
# Expected: 201 (type is not validated server-side)
```

### T9.4: Invalid Confidence Range
```bash
# POST memory with confidence > 1
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Test","confidence":1.5}' | jq '.'
# Expected: 201 (stored, may be clamped or stored as-is)
```

### T9.5: Very Long Content
```bash
# POST memory with very long content (10KB)
LONG_CONTENT=$(python3 -c "print('x' * 10000)")
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"$LONG_CONTENT\"}" | jq '.stored'
# Expected: 201, stored=true
```

### T9.6: Unicode Content
```bash
# POST memory with unicode/emoji
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"Testing unicode: 你好 🎉 émojis"}' | jq '.'
# Expected: 201, content preserved
```

### T9.7: Empty Batch
```bash
# POST batch with empty memories array
curl -s -X POST http://localhost:8765/banks/test-context-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{"memories":[]}' | jq '.'
# Expected: 201, stored=0
```

### T9.8: Server Not Running
```bash
# Verify graceful error when server down
curl -s --connect-timeout 2 http://localhost:8765/health
# Expected: Connection refused error
```

---

## 10. Performance Tests

### T10.1: Vector Index Search Speed
```bash
# Recall should use vector index (< 50ms for 1000 vectors)
time curl -s -X POST http://localhost:8765/banks/test-context-bank/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"performance test","maxResults":10}'
# Expected: < 50ms
```

### T10.2: Batch Store Speed
```bash
# Batch store 10 memories (with LLM extraction disabled)
time curl -s -X POST http://localhost:8765/banks/test-context-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content":"Perf test 1"},{"content":"Perf test 2"},{"content":"Perf test 3"},
      {"content":"Perf test 4"},{"content":"Perf test 5"},{"content":"Perf test 6"},
      {"content":"Perf test 7"},{"content":"Perf test 8"},{"content":"Perf test 9"},
      {"content":"Perf test 10"}
    ],
    "skipExtraction": true
  }'
# Expected: < 1s for 10 memories
```

### T10.3: Persistent LLM Performance
```bash
# Multiple LLM calls should show decreasing time (warm process)
for i in 1 2 3; do
  time curl -s -X POST http://localhost:8765/banks/test-context-bank/memories \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"LLM perf test $i\"}"
done
# Expected: 2nd and 3rd calls faster than 1st
```

### T10.4: Concurrent Requests
```bash
# Multiple parallel requests
for i in 1 2 3 4 5; do
  curl -s http://localhost:8765/health &
done
wait
# Expected: All return 200
```

---

## Execution Plan

### Pre-requisites
1. Server running: `cd /Users/shantham/WIGTrade/hindsight-service && node src/server.js`
2. jq installed for JSON parsing
3. curl installed

### Test Execution Order
1. Health & Stats (verify server is ready)
2. Bank Management (create test banks)
3. Memory Storage (populate test data)
4. Memory Recall (test search features)
5. Context Features (verify new functionality)
6. Reflection (test LLM features)
7. Export/Import (test data portability)
8. Retention & Cleanup (test data management)
9. Error Handling (verify robustness)
10. Performance (verify speed targets)

### Cleanup After Tests
```bash
# Delete test banks
curl -s -X DELETE http://localhost:8765/banks/test-context-bank
curl -s -X DELETE http://localhost:8765/banks/test-minimal
curl -s -X DELETE http://localhost:8765/banks/empty-bank
curl -s -X DELETE http://localhost:8765/banks/imported-bank
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `docs/TEST-PLAN.md` | This comprehensive test plan |
| `test/test-runner.sh` | Main script that runs all test categories |
| `test/utils.sh` | Shared utilities (assertions, setup, cleanup) |

---

## Success Criteria

- [ ] All 78 tests pass
- [ ] No 500 errors on valid requests
- [ ] Context features (actionContext, queryContext, entityBoost) work as designed
- [ ] Performance targets met (< 50ms recall, < 2s LLM extraction)
- [ ] Data persists across server restarts
- [ ] Unicode and special characters handled correctly
