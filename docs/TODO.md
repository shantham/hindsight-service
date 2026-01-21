# Hindsight Service - Limitations & Action Items

## Current Implementation: v2.0.0

---

## Known Limitations

### 1. Vector Search - Brute Force (O(n))

**Status**: ⚠️ Acceptable for current scale, needs improvement for growth

**Current Implementation**:
- In-memory brute-force cosine similarity search
- All vectors loaded into memory as Float32Arrays
- Search complexity: O(n) where n = number of memories

**Performance**:
| Memories | Search Time (approx) |
|----------|---------------------|
| 1,000    | ~5ms               |
| 10,000   | ~20ms              |
| 100,000  | ~200ms             |
| 1,000,000| ~2s (unacceptable) |

**Root Cause**:
- `closevector-hnswlib-wasm` is web-only (Emscripten compiled for browser)
- `hnswlib-node` requires native compilation (fails on Node.js v24.7.0)
- `better-sqlite3` also failed (same native compilation issue)

**Action Items**:
- [ ] **P2**: Evaluate `usearch` library (modern ANN with Node.js support)
- [ ] **P2**: Evaluate `faiss-node` for production workloads
- [ ] **P3**: Consider external vector DB (Pinecone, Weaviate, Qdrant) for >100K memories
- [ ] **P3**: Investigate Node.js v24 native compilation fixes

---

### 2. LLM Provider - Persistent Mode ✅ RESOLVED

**Status**: ✅ Fixed in v2.1

**Current Implementation**:
- **Persistent mode** (default): Single Claude CLI process kept running
- Uses `--input-format stream-json` and `--output-format stream-json`
- Zero cold start after warmup
- ~2-3s per LLM call (instead of ~8s with process spawn)

**Performance**:
| Call | Time |
|------|------|
| Warmup | ~3.3s |
| 1st call | ~2.9s |
| 2nd call | ~1.8s |
| Steady state | ~1.5-2s |

**Remaining Action Items**:
- [ ] **P2**: Test Claude API mode for production
- [ ] **P3**: Add request batching for bulk entity extraction

---

### 3. Database - sql.js (In-Memory SQLite)

**Status**: ⚠️ Works but has limitations

**Current Implementation**:
- Uses `sql.js` (pure JavaScript SQLite via WASM)
- Database persisted to file on changes
- No concurrent write support

**Limitations**:
- Single-threaded writes
- Memory usage grows with database size
- No WAL mode support

**Why Not better-sqlite3**:
- Native compilation fails on Node.js v24.7.0
- Missing `climits` header in build toolchain

**Action Items**:
- [ ] **P2**: Test with Node.js v22 LTS for better-sqlite3 compatibility
- [ ] **P3**: Add database connection pooling for concurrent reads
- [ ] **P3**: Implement periodic database compaction

---

### 4. Embeddings - Single Model

**Status**: ✅ Acceptable

**Current Implementation**:
- Fixed model: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Local execution via transformers.js
- No GPU acceleration

**Limitations**:
- Cannot switch embedding models without re-embedding all memories
- English-optimized (may not work well for other languages)

**Action Items**:
- [ ] **P3**: Add support for multiple embedding models
- [ ] **P3**: Add model migration utility (re-embed existing memories)
- [ ] **P4**: Evaluate multilingual models for international support

---

### 5. Context Features - New in v2.0

**Status**: ✅ Working but needs validation

**Current Implementation**:
- Bank-level context stored in config JSON
- Action context passed per-request
- Query context with Option A (embedding) + Option B (entity boost)

**Limitations**:
- Entity boost weight is hardcoded (0.05)
- Context keyword extraction is simple (split on spaces, filter stop words)
- No validation of context quality

**Action Items**:
- [ ] **P2**: Make entity boost weight configurable per bank
- [ ] **P3**: Improve keyword extraction (use NLP tokenization)
- [ ] **P3**: Add context quality scoring

---

## Priority Legend

| Priority | Meaning | Timeline |
|----------|---------|----------|
| **P1** | Critical - blocking production use | This sprint |
| **P2** | Important - significant improvement | Next 2 sprints |
| **P3** | Nice to have - future enhancement | Backlog |
| **P4** | Low priority - when time permits | Someday |

---

## Environment Constraints

| Component | Constraint | Workaround |
|-----------|------------|------------|
| Node.js v24.7.0 | Native modules fail to compile | Use pure JS/WASM alternatives |
| macOS Darwin 24.6.0 | Missing build headers | Stick with non-native solutions |
| WASM in Node.js | Some WASM targets browser-only | Choose Node.js-compatible WASM |

---

## Completed Items

- [x] Extract Hindsight as standalone service
- [x] Local embeddings (no external API needed)
- [x] LLM provider abstraction (CLI/API modes)
- [x] In-memory vector index (brute-force)
- [x] Bank-level context for domain awareness
- [x] Action context for task-aware extraction
- [x] Query context with enhanced search (Option A + B)
- [x] Database migration from healix-agent-comms
- [x] **Persistent Claude CLI mode** (v2.1) - Zero cold start, ~2s per call

---

## Architecture Decisions

### ADR-001: Use sql.js instead of better-sqlite3
**Decision**: Use pure JavaScript SQLite (sql.js) instead of native bindings
**Rationale**: Native compilation fails on Node.js v24.7.0
**Trade-off**: Slightly slower, no concurrent writes, but works reliably

### ADR-002: Brute-force vector search instead of HNSW
**Decision**: Use in-memory brute-force cosine similarity
**Rationale**: WASM HNSW libraries target browsers; native libraries fail to compile
**Trade-off**: O(n) instead of O(log n), acceptable up to ~50K memories

### ADR-003: Claude CLI for development, API for production
**Decision**: Support both CLI (no cost) and API (scalable) modes
**Rationale**: Claude Max subscription makes CLI free for dev; API needed for production
**Trade-off**: CLI has process spawn overhead; API has per-token cost

### ADR-004: Persistent Claude CLI mode (v2.1)
**Decision**: Keep a single Claude CLI process running with stream-json I/O
**Rationale**: Eliminates ~5-6s cold start overhead per LLM call
**Implementation**: Uses `--input-format stream-json --output-format stream-json --verbose`
**Trade-off**: Process must be restarted if it dies; memory grows with conversation length

---

*Last Updated: 2026-01-21*
