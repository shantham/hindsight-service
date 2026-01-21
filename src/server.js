/**
 * Hindsight Memory Server (Standalone) v2
 * ========================================
 *
 * A standalone semantic memory storage and retrieval service.
 * - Local embeddings (Xenova/transformers.js)
 * - HNSW vector index for O(log n) search
 * - Bank-level and action-level context for LLM extraction
 * - Query context with enhanced embedding and entity boost
 *
 * Endpoints:
 * - GET  /health                    - Health check
 * - GET  /stats                     - Global statistics
 * - GET  /banks                     - List all memory banks
 * - POST /banks                     - Create memory bank (with context)
 * - GET  /banks/:id                 - Get memory bank details
 * - DELETE /banks/:id               - Delete memory bank
 * - POST /banks/:id/memories        - Store memory (with actionContext)
 * - POST /banks/:id/memories/batch  - Batch store memories
 * - GET  /banks/:id/memories        - List memories
 * - POST /banks/:id/recall          - Search memories (with queryContext)
 * - POST /banks/:id/reflect         - Generate insights
 * - GET  /banks/:id/export          - Export bank data
 * - POST /banks/:id/import          - Import bank data
 * - POST /banks/:id/cleanup         - Run retention cleanup
 */

const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Internal providers
const { EmbeddingService } = require('./providers/EmbeddingService');
const { LLMProvider } = require('./providers/LLMProvider');
const { VectorIndex } = require('./providers/VectorIndex');
const { cosineSimilarity } = require('./utils/cosine');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Load configuration
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '../config/config.yml');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');

let config = {
  server: { host: '0.0.0.0', port: 8765 },
  llm: { mode: 'cli', cli: { model: 'claude-sonnet-4-20250514' } },
  embeddings: { model: 'Xenova/all-MiniLM-L6-v2', dimensions: 384 },
  retention: { defaultTtlDays: 0, defaultStrategy: 'expired' },
  vectorIndex: { enabled: true, maxElements: 100000 }
};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = { ...config, ...yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    console.log('[Hindsight] Loaded config from:', CONFIG_PATH);
  }
} catch (err) {
  console.warn('[Hindsight] Could not load config:', err.message);
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Database path
const DB_PATH = path.join(DATA_DIR, 'hindsight.db');

// Global instances
let db = null;

// Initialize providers
const embeddingService = new EmbeddingService({
  model: config.embeddings?.model,
  dimensions: config.embeddings?.dimensions || 384,
  quantized: config.embeddings?.quantized
});

// LLM Provider config - supports persistent, cli, and api modes
const llmMode = config.llm?.mode || 'persistent';
const llmConfig = {
  mode: llmMode,
  model: config.llm?.model || 'claude-sonnet-4-20250514',
  timeout: config.llm?.timeout || 120000,
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: config.llm?.api?.max_tokens || 1000
};

const llmProvider = new LLMProvider(llmConfig);
let llmReady = llmMode !== 'persistent'; // CLI and API are always ready

const vectorIndex = new VectorIndex({
  dimensions: config.embeddings?.dimensions || 384,
  maxElements: config.vectorIndex?.maxElements || 100000
});

let embeddingsReady = false;
let vectorIndexReady = false;

// ═══════════════════════════════════════════════════════════════
// DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════

function dbAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (err) {
    console.error('[DB] Query error:', sql, err.message);
    throw err;
  }
}

function dbGet(sql, params = []) {
  const results = dbAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function dbRun(sql, params = []) {
  try {
    db.run(sql, params);
    saveDatabase();
  } catch (err) {
    console.error('[DB] Run error:', sql, err.message);
    throw err;
  }
}

function dbExec(sql) {
  try {
    db.exec(sql);
    saveDatabase();
  } catch (err) {
    console.error('[DB] Exec error:', err.message);
    throw err;
  }
}

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function getEmbeddings(texts) {
  const input = Array.isArray(texts) ? texts : [texts];
  return await embeddingService.embedBatch(input);
}

async function getLLMCompletion(prompt, systemPrompt = null) {
  return await llmProvider.complete(prompt, systemPrompt);
}

/**
 * Extract entities and facts with context awareness
 * @param {string} content - Memory content
 * @param {string} bankContext - Domain context from bank (optional)
 * @param {string} actionContext - Task context from request (optional)
 */
async function extractEntitiesAndFacts(content, bankContext = null, actionContext = null) {
  // Build context-aware system prompt
  let systemPrompt = `You are an entity and fact extractor.`;

  if (bankContext) {
    systemPrompt += `\n\nDOMAIN CONTEXT: ${bankContext}`;
  }

  if (actionContext) {
    systemPrompt += `\n\nCURRENT TASK CONTEXT: ${actionContext}`;
  }

  systemPrompt += `\n\nGiven the above context (if any), extract from the text:
1. ENTITIES: Named items relevant to the domain (classes, functions, modules, files, UI elements, concepts)
2. FACTS: Key assertions or learnings that can be stated as short sentences

Respond ONLY with valid JSON in this exact format:
{"entities": ["Entity1", "Entity2"], "facts": ["Fact 1", "Fact 2"]}

Keep entities as single words or short phrases. Keep facts concise (under 20 words each).`;

  const prompt = `Extract entities and facts from this content:

"${content}"

Respond with JSON only:`;

  try {
    console.log('[Hindsight] Extracting entities and facts via LLM...');
    const response = await getLLMCompletion(prompt, systemPrompt);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[Hindsight] Extracted ${parsed.entities?.length || 0} entities, ${parsed.facts?.length || 0} facts`);
      return {
        entities: parsed.entities || [],
        facts: parsed.facts || []
      };
    }

    console.warn('[Hindsight] Could not parse LLM response as JSON');
    return { entities: [], facts: [] };
  } catch (err) {
    console.error('[Hindsight] Entity extraction error:', err.message);
    return { entities: [], facts: [] };
  }
}

/**
 * Extract keywords from context for entity boosting
 */
function extractKeywordsFromContext(context) {
  if (!context) return [];

  // Simple keyword extraction: split by spaces and common delimiters
  // Filter out common stop words and short words
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
    'working', 'current', 'currently', 'task', 'flow']);

  const words = context.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];  // Unique keywords
}

/**
 * Calculate entity boost score
 */
function calculateEntityBoost(memoryEntities, contextKeywords, boostWeight = 0.05) {
  if (!contextKeywords || contextKeywords.length === 0) return 0;
  if (!memoryEntities || memoryEntities.length === 0) return 0;

  let matchCount = 0;
  const memEntitiesLower = memoryEntities.map(e => e.toLowerCase());

  for (const keyword of contextKeywords) {
    for (const entity of memEntitiesLower) {
      if (entity.includes(keyword) || keyword.includes(entity)) {
        matchCount++;
        break;  // Count each keyword match once
      }
    }
  }

  return matchCount * boostWeight;
}

function trackAccess(memoryId) {
  try {
    dbRun(`
      UPDATE memories
      SET last_accessed_at = datetime('now'),
          access_count = COALESCE(access_count, 0) + 1
      WHERE id = ?
    `, [memoryId]);
  } catch (err) {
    console.error(`[Hindsight] Failed to track access for ${memoryId}:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    providers: {
      embeddings: {
        ready: embeddingsReady,
        ...embeddingService.getModelInfo()
      },
      llm: {
        ready: llmReady,
        ...llmProvider.getInfo()
      },
      vectorIndex: vectorIndex.getStats()
    }
  });
});

// Global statistics
app.get('/stats', (req, res) => {
  const bankCount = dbGet('SELECT COUNT(*) as count FROM banks');
  const memoryCount = dbGet('SELECT COUNT(*) as count FROM memories');
  const typeStats = dbAll('SELECT type, COUNT(*) as count FROM memories GROUP BY type');

  res.json({
    banks: bankCount?.count || 0,
    memories: memoryCount?.count || 0,
    types: Object.fromEntries(typeStats.map(t => [t.type, t.count])),
    embeddings: embeddingService.getStats(),
    llm: llmProvider.getStats(),
    vectorIndex: vectorIndex.getStats()
  });
});

// List all banks
app.get('/banks', (req, res) => {
  const banks = dbAll(`
    SELECT b.*, COUNT(m.id) as memory_count
    FROM banks b
    LEFT JOIN memories m ON b.id = m.bank_id
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `);

  res.json({
    banks: banks.map(b => ({
      ...b,
      config: JSON.parse(b.config || '{}')
    })),
    total: banks.length
  });
});

// Create memory bank (with context support)
app.post('/banks', (req, res) => {
  const { id, name, description, context, config: bankConfig } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'id and name are required' });
  }

  try {
    const existing = dbGet('SELECT id FROM banks WHERE id = ?', [id]);
    if (existing) {
      return res.json({ id, name, description, exists: true });
    }

    // Merge context into config
    const finalConfig = {
      ...bankConfig,
      context: context || bankConfig?.context || null
    };

    dbRun(`
      INSERT INTO banks (id, name, description, config)
      VALUES (?, ?, ?, ?)
    `, [id, name, description || '', JSON.stringify(finalConfig)]);

    console.log(`[Hindsight] Created bank: ${id}${context ? ' (with context)' : ''}`);
    res.status(201).json({ id, name, description, context, created: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get memory bank
app.get('/banks/:id', (req, res) => {
  const bank = dbGet('SELECT * FROM banks WHERE id = ?', [req.params.id]);

  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  const memoryCount = dbGet('SELECT COUNT(*) as count FROM memories WHERE bank_id = ?', [req.params.id]);
  const typeCounts = dbAll('SELECT type, COUNT(*) as count FROM memories WHERE bank_id = ? GROUP BY type', [req.params.id]);

  const types = Object.fromEntries(typeCounts.map(t => [t.type, t.count]));
  const bankConfig = JSON.parse(bank.config || '{}');

  res.json({
    ...bank,
    config: bankConfig,
    context: bankConfig.context || null,
    memory_count: memoryCount?.count || 0,
    types
  });
});

// Update bank (including context)
app.put('/banks/:id', (req, res) => {
  const bankId = req.params.id;
  const { name, description, context, config: newConfig } = req.body;

  const bank = dbGet('SELECT * FROM banks WHERE id = ?', [bankId]);
  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  try {
    const existingConfig = JSON.parse(bank.config || '{}');
    const finalConfig = {
      ...existingConfig,
      ...newConfig,
      context: context !== undefined ? context : existingConfig.context
    };

    dbRun(`
      UPDATE banks SET name = ?, description = ?, config = ?
      WHERE id = ?
    `, [
      name || bank.name,
      description !== undefined ? description : bank.description,
      JSON.stringify(finalConfig),
      bankId
    ]);

    console.log(`[Hindsight] Updated bank: ${bankId}`);
    res.json({ id: bankId, updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete memory bank
app.delete('/banks/:id', (req, res) => {
  const bankId = req.params.id;

  const bank = dbGet('SELECT id FROM banks WHERE id = ?', [bankId]);
  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  try {
    // Get memory IDs to remove from vector index
    const memories = dbAll('SELECT id FROM memories WHERE bank_id = ?', [bankId]);

    // Remove from vector index
    for (const mem of memories) {
      vectorIndex.removeVector(mem.id);
    }

    const memoryCount = memories.length;
    dbRun('DELETE FROM memories WHERE bank_id = ?', [bankId]);
    dbRun('DELETE FROM banks WHERE id = ?', [bankId]);

    console.log(`[Hindsight] Deleted bank: ${bankId} (${memoryCount} memories)`);
    res.json({ deleted: true, bankId, memoriesRemoved: memoryCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Store memory (retain) - with actionContext support
app.post('/banks/:id/memories', async (req, res) => {
  const bankId = req.params.id;
  const {
    id, content, type, confidence, source, tags,
    storyId, stage, metadata, ttlDays,
    actionContext  // NEW: Task-specific context
  } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const bank = dbGet('SELECT * FROM banks WHERE id = ?', [bankId]);
  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  try {
    // Get bank context
    const bankConfig = JSON.parse(bank.config || '{}');
    const bankContext = bankConfig.context || null;

    console.log(`[Hindsight] Generating embedding for memory...`);
    const [embedding] = await getEmbeddings(content);

    // Extract with both bank and action context
    const { entities, facts } = await extractEntitiesAndFacts(content, bankContext, actionContext);

    const memoryId = id || `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const expiresAt = ttlDays && ttlDays > 0
      ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    dbRun(`
      INSERT INTO memories (id, bank_id, content, type, confidence, source, tags, story_id, stage, embedding, entities, facts, metadata, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      memoryId,
      bankId,
      content,
      type || 'EXPERIENCE',
      confidence || 1.0,
      source || 'agent',
      JSON.stringify(tags || []),
      storyId || null,
      stage || null,
      JSON.stringify(embedding),
      JSON.stringify(entities),
      JSON.stringify(facts),
      JSON.stringify(metadata || {}),
      expiresAt
    ]);

    // Add to vector index
    await vectorIndex.addVector(memoryId, embedding);

    console.log(`[Hindsight] Stored memory: ${memoryId} (${entities.length} entities, ${facts.length} facts)`);
    res.status(201).json({ id: memoryId, stored: true, entities, facts });
  } catch (err) {
    console.error('[Hindsight] Store error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Batch store memories
app.post('/banks/:id/memories/batch', async (req, res) => {
  const bankId = req.params.id;
  const { memories: inputMemories, skipExtraction = false, actionContext } = req.body;

  if (!inputMemories || !Array.isArray(inputMemories)) {
    return res.status(400).json({ error: 'memories array is required' });
  }

  const bank = dbGet('SELECT * FROM banks WHERE id = ?', [bankId]);
  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  try {
    const bankConfig = JSON.parse(bank.config || '{}');
    const bankContext = bankConfig.context || null;

    console.log(`[Hindsight] Batch storing ${inputMemories.length} memories...`);

    const contents = inputMemories.map(m => m.content);
    const embeddings = await getEmbeddings(contents);

    const results = [];

    for (let i = 0; i < inputMemories.length; i++) {
      const mem = inputMemories[i];
      const embedding = embeddings[i];

      let entities = [], facts = [];
      if (!skipExtraction) {
        const extracted = await extractEntitiesAndFacts(
          mem.content,
          bankContext,
          mem.actionContext || actionContext
        );
        entities = extracted.entities;
        facts = extracted.facts;
      }

      const memoryId = mem.id || `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = mem.ttlDays && mem.ttlDays > 0
        ? new Date(Date.now() + mem.ttlDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      dbRun(`
        INSERT INTO memories (id, bank_id, content, type, confidence, source, tags, story_id, stage, embedding, entities, facts, metadata, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        memoryId,
        bankId,
        mem.content,
        mem.type || 'EXPERIENCE',
        mem.confidence || 1.0,
        mem.source || 'agent',
        JSON.stringify(mem.tags || []),
        mem.storyId || null,
        mem.stage || null,
        JSON.stringify(embedding),
        JSON.stringify(entities),
        JSON.stringify(facts),
        JSON.stringify(mem.metadata || {}),
        expiresAt
      ]);

      // Add to vector index
      await vectorIndex.addVector(memoryId, embedding);

      results.push({ id: memoryId, stored: true });
    }

    console.log(`[Hindsight] Batch stored ${results.length} memories`);
    res.status(201).json({ stored: results.length, memories: results });
  } catch (err) {
    console.error('[Hindsight] Batch store error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List memories in bank
app.get('/banks/:id/memories', (req, res) => {
  const bankId = req.params.id;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type;

  let sql = `
    SELECT id, content, type, confidence, source, tags, entities, facts, story_id, stage, access_count, last_accessed_at, expires_at, created_at
    FROM memories WHERE bank_id = ?
  `;
  const params = [bankId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const memories = dbAll(sql, params);
  const total = dbGet('SELECT COUNT(*) as count FROM memories WHERE bank_id = ?', [bankId]);

  res.json({
    memories: memories.map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]'),
      entities: JSON.parse(m.entities || '[]'),
      facts: JSON.parse(m.facts || '[]')
    })),
    total: total?.count || 0,
    limit,
    offset
  });
});

// Search memories (recall) - with queryContext support (Option A + B)
app.post('/banks/:id/recall', async (req, res) => {
  const bankId = req.params.id;
  const {
    query,
    queryContext,        // NEW: Task context for enhanced search
    maxResults = 10,
    minConfidence = 0.1,
    types,
    storyId,
    entityBoostWeight = 0.05  // NEW: Configurable entity boost
  } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    // Option A: Combine query + context for embedding
    let searchText = query;
    if (queryContext) {
      searchText = `${query} | context: ${queryContext}`;
      console.log(`[Hindsight] Enhanced search with context: "${queryContext.substring(0, 50)}..."`);
    }

    console.log(`[Hindsight] Searching for: "${query.substring(0, 50)}..."`);
    const [queryEmbedding] = await getEmbeddings(searchText);

    // Option B: Extract keywords for entity boosting
    const contextKeywords = queryContext ? extractKeywordsFromContext(queryContext) : [];

    let results = [];

    // Try vector index first (O(log n))
    if (vectorIndex.isReady()) {
      const indexResults = await vectorIndex.search(queryEmbedding, maxResults * 5);  // Get more for filtering

      if (indexResults && indexResults.length > 0) {
        // Get full memory data for index results
        const ids = indexResults.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');

        let sql = `SELECT * FROM memories WHERE bank_id = ? AND id IN (${placeholders})`;
        const params = [bankId, ...ids];

        if (types && types.length > 0) {
          sql = `SELECT * FROM memories WHERE bank_id = ? AND id IN (${placeholders}) AND type IN (${types.map(() => '?').join(',')})`;
          params.push(...types);
        }

        if (storyId) {
          sql += ' AND story_id = ?';
          params.push(storyId);
        }

        const memories = dbAll(sql, params);

        // Build score map from index
        const scoreMap = new Map(indexResults.map(r => [r.id, r.score]));

        results = memories.map(mem => {
          const vectorScore = scoreMap.get(mem.id) || 0;
          const entities = JSON.parse(mem.entities || '[]');

          // Option B: Calculate entity boost
          const entityBoost = calculateEntityBoost(entities, contextKeywords, entityBoostWeight);
          const finalScore = vectorScore + entityBoost;

          return {
            id: mem.id,
            content: mem.content,
            type: mem.type,
            confidence: mem.confidence,
            score: finalScore,
            vectorScore,
            entityBoost,
            tags: JSON.parse(mem.tags || '[]'),
            entities,
            facts: JSON.parse(mem.facts || '[]'),
            storyId: mem.story_id,
            stage: mem.stage,
            createdAt: mem.created_at
          };
        });

        console.log(`[Hindsight] Vector index search returned ${results.length} results`);
      }
    }

    // Fallback to brute-force if index not ready or no results
    if (results.length === 0) {
      console.log('[Hindsight] Using brute-force search (index not ready or no results)');

      let sql = 'SELECT * FROM memories WHERE bank_id = ?';
      const params = [bankId];

      if (types && types.length > 0) {
        sql += ` AND type IN (${types.map(() => '?').join(',')})`;
        params.push(...types);
      }

      if (storyId) {
        sql += ' AND story_id = ?';
        params.push(storyId);
      }

      const memories = dbAll(sql, params);

      results = memories.map(mem => {
        const embedding = JSON.parse(mem.embedding || '[]');
        const vectorScore = cosineSimilarity(queryEmbedding, embedding);
        const entities = JSON.parse(mem.entities || '[]');

        // Option B: Calculate entity boost
        const entityBoost = calculateEntityBoost(entities, contextKeywords, entityBoostWeight);
        const finalScore = vectorScore + entityBoost;

        return {
          id: mem.id,
          content: mem.content,
          type: mem.type,
          confidence: mem.confidence,
          score: finalScore,
          vectorScore,
          entityBoost,
          tags: JSON.parse(mem.tags || '[]'),
          entities,
          facts: JSON.parse(mem.facts || '[]'),
          storyId: mem.story_id,
          stage: mem.stage,
          createdAt: mem.created_at
        };
      });
    }

    // Filter and sort by final score
    const finalResults = results
      .filter(m => m.score >= minConfidence)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    // Track access
    finalResults.forEach(r => trackAccess(r.id));

    console.log(`[Hindsight] Found ${finalResults.length} matching memories`);
    res.json({
      memories: finalResults,
      total: finalResults.length,
      query,
      queryContext: queryContext || null,
      contextKeywords: contextKeywords.length > 0 ? contextKeywords : undefined
    });
  } catch (err) {
    console.error('[Hindsight] Recall error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate insights (reflect)
app.post('/banks/:id/reflect', async (req, res) => {
  const bankId = req.params.id;
  const { query, includeMemories, generateInsights, queryContext } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    // Use context-enhanced embedding
    let searchText = query;
    if (queryContext) {
      searchText = `${query} | context: ${queryContext}`;
    }

    console.log(`[Hindsight] Reflecting on: "${query.substring(0, 50)}..."`);
    const [queryEmbedding] = await getEmbeddings(searchText);

    const memories = dbAll('SELECT * FROM memories WHERE bank_id = ?', [bankId]);

    const relevantMemories = memories
      .map(mem => ({
        content: mem.content,
        type: mem.type,
        score: cosineSimilarity(queryEmbedding, JSON.parse(mem.embedding || '[]'))
      }))
      .filter(m => m.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.reflection?.max_context_memories || 10);

    let insights = [];

    if (generateInsights && relevantMemories.length > 0) {
      const memoryContext = relevantMemories
        .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
        .join('\n');

      const prompt = `Based on these memories:\n\n${memoryContext}\n\nQuery: ${query}\n\nProvide 2-3 key insights or patterns you notice. Be concise.`;

      const response = await getLLMCompletion(prompt, 'You are analyzing stored memories to find patterns and insights.');

      insights = response.split('\n')
        .filter(line => line.trim())
        .map(content => ({ content, confidence: 0.8 }));
    }

    console.log(`[Hindsight] Generated ${insights.length} insights`);
    res.json({
      query,
      memories: includeMemories ? relevantMemories : undefined,
      insights,
      memoryCount: relevantMemories.length
    });
  } catch (err) {
    console.error('[Hindsight] Reflect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Export bank data
app.get('/banks/:id/export', (req, res) => {
  const bankId = req.params.id;

  const bank = dbGet('SELECT * FROM banks WHERE id = ?', [bankId]);
  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  const memories = dbAll('SELECT * FROM memories WHERE bank_id = ?', [bankId]);

  const exportData = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    bank: {
      ...bank,
      config: JSON.parse(bank.config || '{}')
    },
    memories: memories.map(m => ({
      ...m,
      embedding: JSON.parse(m.embedding || '[]'),
      tags: JSON.parse(m.tags || '[]'),
      entities: JSON.parse(m.entities || '[]'),
      facts: JSON.parse(m.facts || '[]'),
      metadata: JSON.parse(m.metadata || '{}')
    }))
  };

  res.json(exportData);
});

// Import bank data
app.post('/banks/:id/import', async (req, res) => {
  const bankId = req.params.id;
  const { data, merge = false } = req.body;

  if (!data || !data.memories) {
    return res.status(400).json({ error: 'data with memories array is required' });
  }

  try {
    let bank = dbGet('SELECT id FROM banks WHERE id = ?', [bankId]);
    if (!bank) {
      dbRun(`INSERT INTO banks (id, name, description, config) VALUES (?, ?, ?, ?)`, [
        bankId,
        data.bank?.name || bankId,
        data.bank?.description || '',
        JSON.stringify(data.bank?.config || {})
      ]);
    }

    if (!merge) {
      // Remove from vector index
      const existingMemories = dbAll('SELECT id FROM memories WHERE bank_id = ?', [bankId]);
      for (const mem of existingMemories) {
        vectorIndex.removeVector(mem.id);
      }
      dbRun('DELETE FROM memories WHERE bank_id = ?', [bankId]);
    }

    let imported = 0;
    for (const mem of data.memories) {
      const embedding = Array.isArray(mem.embedding) ? mem.embedding : [];

      dbRun(`
        INSERT OR REPLACE INTO memories (id, bank_id, content, type, confidence, source, tags, story_id, stage, embedding, entities, facts, metadata, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        mem.id,
        bankId,
        mem.content,
        mem.type || 'EXPERIENCE',
        mem.confidence || 1.0,
        mem.source || 'import',
        JSON.stringify(mem.tags || []),
        mem.story_id || null,
        mem.stage || null,
        JSON.stringify(embedding),
        JSON.stringify(mem.entities || []),
        JSON.stringify(mem.facts || []),
        JSON.stringify(mem.metadata || {}),
        mem.expires_at || null,
        mem.created_at || new Date().toISOString()
      ]);

      // Add to vector index
      if (embedding.length > 0) {
        await vectorIndex.addVector(mem.id, embedding);
      }

      imported++;
    }

    console.log(`[Hindsight] Imported ${imported} memories to bank ${bankId}`);
    res.json({ imported, bankId, merge });
  } catch (err) {
    console.error('[Hindsight] Import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Run retention cleanup
app.post('/banks/:id/cleanup', async (req, res) => {
  const bankId = req.params.id;
  const { strategy = 'expired', limit = 100, dryRun = false } = req.body;

  const bank = dbGet('SELECT id FROM banks WHERE id = ?', [bankId]);
  if (!bank) {
    return res.status(404).json({ error: 'Bank not found' });
  }

  try {
    let memories = [];

    switch (strategy) {
      case 'expired':
        memories = dbAll(`
          SELECT id, expires_at FROM memories
          WHERE bank_id = ? AND expires_at IS NOT NULL AND expires_at < datetime('now')
        `, [bankId]);
        break;
      case 'oldest_first':
        memories = dbAll(`
          SELECT id, created_at FROM memories WHERE bank_id = ?
          ORDER BY created_at ASC LIMIT ?
        `, [bankId, limit]);
        break;
      case 'lowest_confidence':
        memories = dbAll(`
          SELECT id, confidence FROM memories WHERE bank_id = ?
          ORDER BY confidence ASC LIMIT ?
        `, [bankId, limit]);
        break;
      case 'least_accessed':
        memories = dbAll(`
          SELECT id, last_accessed_at, access_count FROM memories WHERE bank_id = ?
          ORDER BY COALESCE(last_accessed_at, created_at) ASC, access_count ASC LIMIT ?
        `, [bankId, limit]);
        break;
      default:
        return res.status(400).json({ error: `Unknown strategy: ${strategy}` });
    }

    if (!dryRun && memories.length > 0) {
      for (const mem of memories) {
        vectorIndex.removeVector(mem.id);
        dbRun('DELETE FROM memories WHERE id = ?', [mem.id]);
      }
    }

    res.json({
      strategy,
      removed: memories.length,
      memories: memories.map(m => ({ id: m.id })),
      dryRun
    });
  } catch (err) {
    console.error('[Hindsight] Cleanup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION & START SERVER
// ═══════════════════════════════════════════════════════════════

async function initializeDatabase() {
  console.log('[Hindsight] Initializing database...');

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[Hindsight] Loaded existing database:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[Hindsight] Created new database:', DB_PATH);
  }

  dbExec(`
    CREATE TABLE IF NOT EXISTS banks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'EXPERIENCE',
      confidence REAL DEFAULT 1.0,
      source TEXT,
      tags TEXT,
      story_id TEXT,
      stage TEXT,
      embedding TEXT,
      entities TEXT,
      facts TEXT,
      metadata TEXT,
      expires_at DATETIME,
      last_accessed_at DATETIME,
      access_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memories_bank ON memories(bank_id);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_story ON memories(story_id);
    CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at);
  `);

  console.log('[Hindsight] Database schema initialized');
}

async function buildVectorIndex() {
  console.log('[Hindsight] Building vector index from existing memories...');

  try {
    await vectorIndex.initialize();

    // Load all memories with embeddings
    const memories = dbAll('SELECT id, embedding FROM memories WHERE embedding IS NOT NULL');

    const memoriesWithEmbeddings = memories
      .map(m => ({
        id: m.id,
        embedding: JSON.parse(m.embedding || '[]')
      }))
      .filter(m => m.embedding.length > 0);

    await vectorIndex.buildFromMemories(memoriesWithEmbeddings);
    vectorIndexReady = true;

    console.log('[Hindsight] Vector index ready');
  } catch (err) {
    console.error('[Hindsight] Failed to build vector index:', err.message);
    console.warn('[Hindsight] Will use brute-force search as fallback');
  }
}

async function startServer() {
  await initializeDatabase();

  // Initialize embedding service
  embeddingService.initialize().then(() => {
    embeddingsReady = true;
    console.log('[Hindsight] Embedding service ready');
  }).catch(err => {
    console.error('[Hindsight] Failed to initialize embedding service:', err.message);
  });

  // Build vector index
  await buildVectorIndex();

  // Initialize LLM provider (for persistent mode)
  if (llmConfig.mode === 'persistent') {
    console.log('[Hindsight] Initializing persistent LLM provider...');
    llmProvider.initialize().then(() => {
      llmReady = true;
      console.log('[Hindsight] LLM provider ready (persistent mode)');
    }).catch(err => {
      console.warn('[Hindsight] LLM provider failed to initialize:', err.message);
      console.warn('[Hindsight] LLM will auto-initialize on first call');
      llmReady = true; // Will auto-initialize on first call
    });
  }

  const PORT = process.env.PORT || config.server?.port || 8765;
  const HOST = config.server?.host || '0.0.0.0';

  const server = app.listen(PORT, HOST, () => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' Hindsight Memory Server v2.1 (Standalone)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Listening on: http://${HOST}:${PORT}`);
    console.log(`  Database:     ${DB_PATH}`);
    console.log(`  LLM Mode:     ${llmConfig.mode} (${llmConfig.model})`);
    console.log(`  Embeddings:   Local (${config.embeddings?.model})`);
    console.log(`  Vector Index: ${vectorIndexReady ? 'Ready' : 'Fallback to brute-force'}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Features:');
    console.log('  - Persistent Claude CLI (zero cold start after warmup)');
    console.log('  - In-memory vector index for fast search');
    console.log('  - Bank-level context (domain awareness)');
    console.log('  - Action context for storage (task awareness)');
    console.log('  - Query context for recall (enhanced embedding + entity boost)');
    console.log('');
  });

  // Graceful shutdown handlers
  const shutdown = async (signal) => {
    console.log(`\n[Hindsight] Received ${signal}, shutting down gracefully...`);

    // Shutdown LLM provider first (kill persistent process)
    if (llmConfig.mode === 'persistent') {
      console.log('[Hindsight] Shutting down LLM provider...');
      await llmProvider.shutdown();
    }

    // Save database
    if (db) {
      console.log('[Hindsight] Saving database...');
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
      console.log('[Hindsight] Database saved');
    }

    // Close HTTP server
    server.close(() => {
      console.log('[Hindsight] Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.log('[Hindsight] Force exit');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('[Hindsight] Failed to start server:', err);
  process.exit(1);
});
