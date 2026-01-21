/**
 * VectorIndex.js - In-memory vector index for fast similarity search
 *
 * Uses optimized in-memory brute-force search with Float32Arrays.
 * For ~20K vectors, search is O(n) but very fast due to optimized memory layout.
 *
 * Usage:
 *   const index = new VectorIndex({ dimensions: 384 });
 *   await index.initialize();
 *   await index.addVector('mem-123', embedding);
 *   const results = await index.search(queryEmbedding, 10);
 */

const { EventEmitter } = require('events');

class VectorIndex extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      dimensions: options.dimensions || 384,
      maxElements: options.maxElements || 100000,
      ...options
    };

    // In-memory storage using Maps for O(1) lookup
    this.idToVector = new Map();     // memory_id -> Float32Array
    this.initialized = false;
    this.initializing = false;

    this.stats = {
      vectorCount: 0,
      searches: 0,
      avgSearchTimeMs: 0
    };
  }

  /**
   * Initialize the vector index
   */
  async initialize() {
    if (this.initialized) return true;

    if (this.initializing) {
      return new Promise((resolve) => {
        this.once('initialized', () => resolve(true));
      });
    }

    this.initializing = true;

    try {
      console.log('[VectorIndex] Initializing in-memory vector index...');

      this.initialized = true;
      this.initializing = false;

      console.log(`[VectorIndex] Index ready (dimensions=${this.config.dimensions})`);
      this.emit('initialized');

      return true;
    } catch (error) {
      this.initializing = false;
      console.error('[VectorIndex] Failed to initialize:', error.message);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Add a vector to the index
   * @param {string} id - Memory ID
   * @param {number[]} embedding - Vector embedding
   */
  async addVector(id, embedding) {
    if (!this.initialized) {
      console.warn('[VectorIndex] Index not initialized, skipping add');
      return false;
    }

    try {
      // Store as Float32Array for memory efficiency and faster cosine calculation
      const vector = Array.isArray(embedding) ? new Float32Array(embedding) : embedding;

      // Update or add
      const isNew = !this.idToVector.has(id);
      this.idToVector.set(id, vector);

      if (isNew) {
        this.stats.vectorCount++;
      }

      return true;
    } catch (error) {
      console.error(`[VectorIndex] Failed to add vector ${id}:`, error.message);
      return false;
    }
  }

  /**
   * Remove a vector from the index
   * @param {string} id - Memory ID
   */
  async removeVector(id) {
    if (!this.initialized) return false;

    if (!this.idToVector.has(id)) return false;

    try {
      this.idToVector.delete(id);
      this.stats.vectorCount--;
      return true;
    } catch (error) {
      console.error(`[VectorIndex] Failed to remove vector ${id}:`, error.message);
      return false;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  _cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Search for nearest neighbors using brute-force cosine similarity
   * @param {number[]} queryEmbedding - Query vector
   * @param {number} k - Number of results
   * @returns {Array<{id: string, score: number}>} - Nearest neighbors sorted by similarity
   */
  async search(queryEmbedding, k = 10) {
    if (!this.initialized) {
      return null;
    }

    const startTime = Date.now();

    try {
      const queryVector = Array.isArray(queryEmbedding)
        ? new Float32Array(queryEmbedding)
        : queryEmbedding;

      // Calculate similarity for all vectors
      const similarities = [];

      for (const [id, vector] of this.idToVector) {
        const score = this._cosineSimilarity(queryVector, vector);
        similarities.push({ id, score });
      }

      // Sort by similarity (descending) and take top k
      similarities.sort((a, b) => b.score - a.score);
      const results = similarities.slice(0, k);

      // Update stats
      const elapsed = Date.now() - startTime;
      this.stats.searches++;
      this.stats.avgSearchTimeMs = (
        (this.stats.avgSearchTimeMs * (this.stats.searches - 1) + elapsed) /
        this.stats.searches
      );

      return results;
    } catch (error) {
      console.error('[VectorIndex] Search failed:', error.message);
      return null;
    }
  }

  /**
   * Build index from existing memories
   * @param {Array<{id: string, embedding: number[]}>} memories - Memories with embeddings
   */
  async buildFromMemories(memories) {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`[VectorIndex] Building index from ${memories.length} memories...`);
    const startTime = Date.now();

    let added = 0;
    for (const mem of memories) {
      if (mem.embedding && mem.embedding.length === this.config.dimensions) {
        await this.addVector(mem.id, mem.embedding);
        added++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[VectorIndex] Built index with ${added} vectors in ${elapsed}ms`);

    return true;
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      vectorCount: this.stats.vectorCount,
      searches: this.stats.searches,
      avgSearchTimeMs: Math.round(this.stats.avgSearchTimeMs * 100) / 100,
      dimensions: this.config.dimensions,
      maxElements: this.config.maxElements
    };
  }

  /**
   * Check if index is ready for use
   */
  isReady() {
    return this.initialized;
  }
}

module.exports = { VectorIndex };
