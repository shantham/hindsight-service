# Hindsight Service v2.1

**Semantic Memory Storage & Retrieval Service**

A standalone service that enables applications to store, search, and reason about memories using semantic understanding. Built with local embeddings (no API costs for vectors) and optional Claude LLM integration for intelligent extraction and reflection.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Context Features (v2.1)](#context-features-v21)
- [Client SDKs & Examples](#client-sdks--examples)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Testing](#testing)

---

## Overview

Hindsight Service provides semantic memory capabilities for any application. Unlike traditional key-value stores or full-text search, Hindsight understands the *meaning* of your data:

```
"Where is the submit button?" → Finds "The payment form has a blue submit button at the bottom"
"User preferences" → Finds "User prefers dark mode with large fonts"
"Authentication patterns" → Finds "Login requires email + password, supports OAuth"
```

### Use Cases

- **AI Assistants**: Store and recall conversation context, user preferences, learned patterns
- **Test Automation**: Remember selectors, page structures, application behaviors
- **Knowledge Management**: Store decisions, experiences, and domain facts
- **Personalization**: Track user preferences and behaviors across sessions

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Semantic Search** | Find memories by meaning, not just keywords |
| **Local Embeddings** | Uses all-MiniLM-L6-v2 model (no external API costs) |
| **Entity Extraction** | Auto-extracts entities and facts from content |
| **Context-Aware (v2.1)** | Query and action context for enhanced relevance |
| **Entity Boost (v2.1)** | Boosts results matching context keywords |
| **Memory Banks** | Isolated namespaces for different domains |
| **Retention Management** | TTL, access tracking, cleanup strategies |
| **Import/Export** | Full backup and migration support |
| **Reflection** | LLM-powered insights from your memories |

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd hindsight-service

# Install dependencies
npm install

# Start the server
npm start
```

The server starts at `http://localhost:8765`.

### Docker

```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop
docker-compose down
```

### Verify Installation

```bash
# Health check
curl http://localhost:8765/health

# Expected response:
{
  "status": "ok",
  "version": "2.1.0",
  "providers": {
    "embedding": { "state": "READY" },
    "llm": { "state": "READY", "mode": "cli" },
    "vectorIndex": { "initialized": true }
  }
}
```

### Your First Memory

```bash
# 1. Create a memory bank
curl -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{"id":"my-app","name":"My Application","context":"E-commerce shopping application"}'

# 2. Store a memory
curl -X POST http://localhost:8765/banks/my-app/memories \
  -H "Content-Type: application/json" \
  -d '{"content":"The checkout button is a blue button with text Submit Order"}'

# 3. Recall memories
curl -X POST http://localhost:8765/banks/my-app/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"where is the checkout button?"}'
```

---

## Core Concepts

### Memory Banks

Banks are isolated namespaces for organizing memories. Each bank has:

- **id**: Unique identifier (e.g., `my-app`, `test-automation`, `user-123`)
- **name**: Human-readable name
- **description**: Optional description
- **context** (v2.1): Domain context for enhanced entity extraction

```bash
# Create a bank with context
curl -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "payment-tests",
    "name": "Payment Test Suite",
    "description": "Memories for payment flow testing",
    "context": "E-commerce payment processing with credit cards and PayPal"
  }'
```

### Memories

A memory is a piece of information with:

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | **Required.** The memory content |
| `type` | string | Category (see Memory Types below) |
| `confidence` | number | 0.0 to 1.0, how certain this memory is |
| `tags` | array | Custom tags for filtering |
| `metadata` | object | Custom key-value metadata |
| `ttlDays` | number | Auto-expire after N days |
| `storyId` | string | Group related memories |
| `actionContext` | string | (v2.1) Context for this specific memory |

### Memory Types

| Type | Use Case | Example |
|------|----------|---------|
| `WORLD_FACT` | General knowledge | "Credit cards have 16 digits" |
| `EXPERIENCE` | Past interactions | "User abandoned cart after shipping cost shown" |
| `OPINION` | Preferences/judgments | "User prefers PayPal over credit card" |
| `PATTERN` | Learned patterns | "Login button has class .btn-primary" |
| `DECISION` | Architectural decisions | "We use JWT tokens for auth" |

### Semantic Search

Hindsight uses vector embeddings to understand meaning:

```bash
# These queries will all find "The submit button is blue and located at the bottom of the form"

curl -X POST http://localhost:8765/banks/my-app/recall \
  -d '{"query": "where is the submit button?"}'

curl -X POST http://localhost:8765/banks/my-app/recall \
  -d '{"query": "button location"}'

curl -X POST http://localhost:8765/banks/my-app/recall \
  -d '{"query": "form submission element"}'
```

---

## API Reference

### Health & Stats

#### GET /health

Check service health and provider status.

```bash
curl http://localhost:8765/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "2.1.0",
  "uptime": 3600,
  "providers": {
    "embedding": { "state": "READY", "model": "all-MiniLM-L6-v2" },
    "llm": { "state": "READY", "mode": "persistent", "pid": 12345 },
    "vectorIndex": { "initialized": true, "vectorCount": 1500 }
  }
}
```

#### GET /stats

Get global statistics.

```bash
curl http://localhost:8765/stats
```

**Response:**
```json
{
  "banks": 5,
  "memories": 1234,
  "byType": {
    "PATTERN": 500,
    "EXPERIENCE": 400,
    "WORLD_FACT": 200,
    "DECISION": 100,
    "OPINION": 34
  }
}
```

---

### Bank Management

#### GET /banks

List all memory banks.

```bash
curl http://localhost:8765/banks
```

#### POST /banks

Create a new memory bank.

```bash
curl -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-bank",
    "name": "My Memory Bank",
    "description": "Optional description",
    "context": "Domain context for entity extraction"
  }'
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `name` | Yes | Human-readable name |
| `description` | No | Description |
| `context` | No | Domain context (v2.1) |

#### GET /banks/:id

Get bank details.

```bash
curl http://localhost:8765/banks/my-bank
```

#### PUT /banks/:id

Update bank properties.

```bash
curl -X PUT http://localhost:8765/banks/my-bank \
  -H "Content-Type: application/json" \
  -d '{"context": "Updated domain context"}'
```

#### DELETE /banks/:id

Delete a bank and all its memories.

```bash
curl -X DELETE http://localhost:8765/banks/my-bank
```

---

### Memory Storage

#### POST /banks/:id/memories

Store a single memory.

```bash
curl -X POST http://localhost:8765/banks/my-bank/memories \
  -H "Content-Type: application/json" \
  -d '{
    "content": "The login form has email and password fields",
    "type": "PATTERN",
    "confidence": 0.9,
    "tags": ["auth", "form", "selector"],
    "metadata": {"source": "login.spec.ts", "line": 42},
    "ttlDays": 30,
    "actionContext": "Documenting login page structure"
  }'
```

**Response:**
```json
{
  "stored": true,
  "id": "mem_abc123",
  "entities": ["login form", "email field", "password field"],
  "facts": ["login form has email field", "login form has password field"]
}
```

#### POST /banks/:id/memories/batch

Store multiple memories at once.

```bash
curl -X POST http://localhost:8765/banks/my-bank/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content": "Username field accepts email format"},
      {"content": "Password requires 8+ characters"},
      {"content": "Submit button is disabled until valid"}
    ],
    "actionContext": "Documenting form validation rules",
    "skipExtraction": false
  }'
```

| Field | Description |
|-------|-------------|
| `memories` | Array of memory objects |
| `actionContext` | Shared context for all memories |
| `skipExtraction` | Skip LLM entity extraction (faster) |

#### GET /banks/:id/memories

List memories with pagination.

```bash
curl "http://localhost:8765/banks/my-bank/memories?limit=20&offset=0"
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 50 | Max memories to return |
| `offset` | 0 | Skip N memories |

---

### Memory Recall

#### POST /banks/:id/recall

Semantic search for memories.

```bash
curl -X POST http://localhost:8765/banks/my-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "login button location",
    "maxResults": 10,
    "minConfidence": 0.5,
    "types": ["PATTERN"],
    "queryContext": "Fixing flaky login test",
    "entityBoostWeight": 0.05
  }'
```

**Parameters:**

| Field | Default | Description |
|-------|---------|-------------|
| `query` | **Required** | Search query |
| `maxResults` | 10 | Maximum results to return |
| `minConfidence` | 0.0 | Filter by minimum confidence |
| `types` | all | Filter by memory types |
| `storyId` | - | Filter by story ID |
| `queryContext` | - | (v2.1) Context for enhanced search |
| `entityBoostWeight` | 0.05 | (v2.1) Weight for entity matching |

**Response:**
```json
{
  "memories": [
    {
      "id": "mem_abc123",
      "content": "Login button is in the header with class .login-btn",
      "type": "PATTERN",
      "score": 0.89,
      "vectorScore": 0.85,
      "entityBoost": 0.04,
      "confidence": 0.9,
      "entities": ["login button", "header"],
      "tags": ["auth", "selector"],
      "created_at": "2024-01-15T10:30:00Z",
      "access_count": 5
    }
  ],
  "total": 1,
  "contextKeywords": ["login", "test", "fixing", "flaky"]
}
```

---

### Reflection

#### POST /banks/:id/reflect

Generate AI insights from memories.

```bash
curl -X POST http://localhost:8765/banks/my-bank/reflect \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the common patterns in our test failures?",
    "includeMemories": true,
    "queryContext": "Improving CI/CD reliability"
  }'
```

**Response:**
```json
{
  "insights": "Based on your memories, I see three common patterns...",
  "memories": [...],
  "memoryCount": 15
}
```

---

### Export/Import

#### GET /banks/:id/export

Export a bank with all memories and embeddings.

```bash
curl http://localhost:8765/banks/my-bank/export > backup.json
```

#### POST /banks/:id/import

Import bank data.

```bash
# Import to new bank
curl -X POST http://localhost:8765/banks/new-bank/import \
  -H "Content-Type: application/json" \
  -d '{"data": <exported-json>}'

# Merge with existing bank
curl -X POST http://localhost:8765/banks/existing-bank/import \
  -H "Content-Type: application/json" \
  -d '{"data": <exported-json>, "merge": true}'
```

---

### Retention & Cleanup

#### POST /banks/:id/cleanup

Run cleanup with a specific strategy.

```bash
curl -X POST http://localhost:8765/banks/my-bank/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "oldest_first",
    "limit": 100,
    "dryRun": true
  }'
```

**Strategies:**

| Strategy | Description |
|----------|-------------|
| `expired` | Remove memories past their TTL |
| `oldest_first` | Remove oldest memories first |
| `lowest_confidence` | Remove low-confidence memories |
| `least_accessed` | Remove rarely-accessed memories |
| `over_limit` | Trim to bank size limit |

**Response:**
```json
{
  "removed": 25,
  "strategy": "oldest_first",
  "dryRun": true
}
```

---

## Context Features (v2.1)

Version 2.1 introduces context-aware features for enhanced relevance.

### Bank Context

Set a domain context when creating a bank:

```bash
curl -X POST http://localhost:8765/banks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "payment-tests",
    "name": "Payment Tests",
    "context": "E-commerce payment processing with credit cards, PayPal, and Apple Pay"
  }'
```

This context helps the LLM extract more relevant entities. For example, "CVC" will be recognized as a credit card term.

### Action Context

Provide context when storing memories:

```bash
curl -X POST http://localhost:8765/banks/payment-tests/memories \
  -H "Content-Type: application/json" \
  -d '{
    "content": "The field shows error for invalid input",
    "actionContext": "Testing credit card validation"
  }'
```

The action context overrides bank context for more specific entity extraction.

### Query Context

Provide context when searching:

```bash
curl -X POST http://localhost:8765/banks/payment-tests/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "submit button",
    "queryContext": "Debugging payment submission on slow networks"
  }'
```

This enables **entity boost**: memories containing entities matching your context keywords get higher scores.

### Entity Boost

When you provide `queryContext`, the service:

1. Extracts keywords from your context (filtering stop words)
2. Compares keywords against memory entities
3. Adds a boost to the score for matching entities

```json
{
  "memories": [{
    "content": "Payment submit button triggers API call",
    "score": 0.89,
    "vectorScore": 0.85,
    "entityBoost": 0.04
  }],
  "contextKeywords": ["payment", "submission", "debugging", "networks", "slow"]
}
```

Adjust the boost weight with `entityBoostWeight` (default: 0.05):

```bash
curl -X POST http://localhost:8765/banks/my-bank/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "button",
    "queryContext": "payment flow",
    "entityBoostWeight": 0.1
  }'
```

---

## Client SDKs & Examples

### JavaScript/TypeScript

```typescript
const HINDSIGHT_URL = process.env.HINDSIGHT_URL || 'http://localhost:8765';

class HindsightClient {
  constructor(private baseUrl: string = HINDSIGHT_URL) {}

  async createBank(id: string, name: string, context?: string) {
    const res = await fetch(`${this.baseUrl}/banks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, context })
    });
    return res.json();
  }

  async store(bankId: string, content: string, options: {
    type?: string;
    confidence?: number;
    tags?: string[];
    actionContext?: string;
  } = {}) {
    const res = await fetch(`${this.baseUrl}/banks/${bankId}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, ...options })
    });
    return res.json();
  }

  async recall(bankId: string, query: string, options: {
    maxResults?: number;
    queryContext?: string;
    types?: string[];
  } = {}) {
    const res = await fetch(`${this.baseUrl}/banks/${bankId}/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...options })
    });
    return res.json();
  }

  async reflect(bankId: string, query: string, queryContext?: string) {
    const res = await fetch(`${this.baseUrl}/banks/${bankId}/reflect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, queryContext, includeMemories: true })
    });
    return res.json();
  }
}

// Usage
const hindsight = new HindsightClient();

await hindsight.createBank('my-app', 'My Application', 'E-commerce platform');

await hindsight.store('my-app', 'User prefers dark mode', {
  type: 'OPINION',
  confidence: 0.9,
  tags: ['preferences', 'ui']
});

const results = await hindsight.recall('my-app', 'user preferences', {
  maxResults: 5,
  queryContext: 'Personalizing dashboard display'
});

console.log(results.memories);
```

### Python

```python
import requests
from typing import Optional, List, Dict, Any

class HindsightClient:
    def __init__(self, base_url: str = "http://localhost:8765"):
        self.base_url = base_url

    def create_bank(self, bank_id: str, name: str, context: Optional[str] = None) -> Dict[str, Any]:
        response = requests.post(
            f"{self.base_url}/banks",
            json={"id": bank_id, "name": name, "context": context}
        )
        return response.json()

    def store(
        self,
        bank_id: str,
        content: str,
        memory_type: Optional[str] = None,
        confidence: Optional[float] = None,
        tags: Optional[List[str]] = None,
        action_context: Optional[str] = None
    ) -> Dict[str, Any]:
        payload = {"content": content}
        if memory_type:
            payload["type"] = memory_type
        if confidence is not None:
            payload["confidence"] = confidence
        if tags:
            payload["tags"] = tags
        if action_context:
            payload["actionContext"] = action_context

        response = requests.post(
            f"{self.base_url}/banks/{bank_id}/memories",
            json=payload
        )
        return response.json()

    def recall(
        self,
        bank_id: str,
        query: str,
        max_results: int = 10,
        query_context: Optional[str] = None,
        types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        payload = {"query": query, "maxResults": max_results}
        if query_context:
            payload["queryContext"] = query_context
        if types:
            payload["types"] = types

        response = requests.post(
            f"{self.base_url}/banks/{bank_id}/recall",
            json=payload
        )
        return response.json()

    def reflect(
        self,
        bank_id: str,
        query: str,
        query_context: Optional[str] = None
    ) -> Dict[str, Any]:
        payload = {"query": query, "includeMemories": True}
        if query_context:
            payload["queryContext"] = query_context

        response = requests.post(
            f"{self.base_url}/banks/{bank_id}/reflect",
            json=payload
        )
        return response.json()

# Usage
hindsight = HindsightClient()

hindsight.create_bank("my-app", "My Application", "E-commerce platform")

hindsight.store(
    "my-app",
    "User prefers dark mode",
    memory_type="OPINION",
    confidence=0.9,
    tags=["preferences", "ui"]
)

results = hindsight.recall(
    "my-app",
    "user preferences",
    max_results=5,
    query_context="Personalizing dashboard display"
)

for memory in results["memories"]:
    print(f"- {memory['content']} (score: {memory['score']:.2f})")
```

### cURL Examples

```bash
# Store with context
curl -X POST http://localhost:8765/banks/my-app/memories \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Login requires email verification for new accounts",
    "type": "PATTERN",
    "actionContext": "Documenting authentication requirements"
  }'

# Recall with context
curl -X POST http://localhost:8765/banks/my-app/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "account creation",
    "queryContext": "Building signup flow tests",
    "maxResults": 5
  }'

# Batch store with shared context
curl -X POST http://localhost:8765/banks/my-app/memories/batch \
  -H "Content-Type: application/json" \
  -d '{
    "memories": [
      {"content": "Email field validates format"},
      {"content": "Password must be 8+ characters"},
      {"content": "Confirm password must match"}
    ],
    "actionContext": "Documenting registration form validation"
  }'

# Reflect on patterns
curl -X POST http://localhost:8765/banks/my-app/reflect \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What validation patterns do we use?",
    "queryContext": "Standardizing form validation across the app"
  }'
```

---

## Configuration

### config/config.yml

```yaml
# Server settings
server:
  port: 8765
  host: "0.0.0.0"

# LLM settings
llm:
  mode: cli          # 'cli' for Claude CLI, 'api' for Anthropic SDK
  model: claude-3-haiku-20240307
  persistent: true   # Keep LLM process running between calls

# Embedding settings
embedding:
  model: Xenova/all-MiniLM-L6-v2
  dimensions: 384

# Database settings
database:
  path: ./data/hindsight.db

# Vector index settings
vectorIndex:
  enabled: true
  rebuildOnStart: false
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8765 | Server port |
| `DATA_DIR` | ./data | Database directory |
| `CONFIG_PATH` | ./config/config.yml | Configuration file |
| `ANTHROPIC_API_KEY` | - | Required for API mode |
| `LLM_MODE` | cli | Override config LLM mode |

---

## Best Practices

### Memory Content

- **Be specific**: "Login button has class .btn-login in header" > "There's a login button"
- **Include context**: "For mobile viewport, menu is collapsed" > "Menu is collapsed"
- **Use consistent terminology**: Pick terms and stick with them

### Memory Types

- Use `PATTERN` for selectors, structures, and behaviors
- Use `EXPERIENCE` for observations from actual runs
- Use `DECISION` for architectural choices
- Use `WORLD_FACT` for domain knowledge
- Use `OPINION` for preferences and judgments

### Confidence Scores

| Score | When to Use |
|-------|-------------|
| 0.9+ | Verified multiple times, very reliable |
| 0.7-0.9 | Observed once, likely accurate |
| 0.5-0.7 | Inferred or uncertain |
| < 0.5 | Speculative, needs verification |

### Bank Organization

- Create separate banks for different domains
- Use bank context to improve extraction quality
- Consider one bank per application/project

### Context Usage (v2.1)

- Set bank context for your domain
- Use actionContext for specific tasks
- Use queryContext when searching
- Keep contexts concise but descriptive

### Retention

- Set TTL for temporary memories
- Run periodic cleanup with `least_accessed` strategy
- Export banks before major cleanups

---

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
lsof -i :8765

# Check logs
npm start 2>&1 | head -100
```

### Slow First Request

The first request downloads the embedding model (~22MB). Subsequent requests are fast.

```bash
# Pre-warm the model
curl http://localhost:8765/health
```

### LLM Extraction Fails

```bash
# Check LLM health
curl http://localhost:8765/health | jq '.providers.llm'

# For CLI mode, verify Claude is installed
claude --version

# For API mode, verify key is set
echo $ANTHROPIC_API_KEY
```

### Low Quality Matches

- Provide `queryContext` to improve relevance
- Store more specific memories
- Check if memories have good entity extraction

### Database Issues

```bash
# Check database exists
ls -la ./data/hindsight.db

# Rebuild vector index
curl -X POST http://localhost:8765/admin/rebuild-index
```

---

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific categories
npm run test:health
npm run test:banks
npm run test:memories
npm run test:recall
npm run test:context

# List available test commands
./test/test-runner.sh --help
```

See [docs/TEST-PLAN.md](docs/TEST-PLAN.md) for the full 78-test plan covering all endpoints and features.

---

## Data Location

| Data | Location |
|------|----------|
| SQLite Database | `data/hindsight.db` |
| Model Cache | `~/.cache/huggingface/hub/` |
| Configuration | `config/config.yml` |
| Logs | stdout/stderr |

---

## License

MIT

---

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/hindsight-service/issues)
- **Documentation**: [docs/](docs/)
- **Test Plan**: [docs/TEST-PLAN.md](docs/TEST-PLAN.md)
