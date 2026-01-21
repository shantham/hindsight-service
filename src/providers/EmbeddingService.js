/**
 * EmbeddingService.js - Local embeddings using Xenova/transformers.js
 *
 * Provides semantic text embeddings using all-MiniLM-L6-v2 model.
 * Runs locally, no API costs.
 *
 * Model: Xenova/all-MiniLM-L6-v2
 * Dimensions: 384
 * Size: ~22MB (downloaded on first use)
 *
 * Usage:
 *   const service = new EmbeddingService();
 *   await service.initialize();
 *   const embedding = await service.embed("Hello world");
 *   const embeddings = await service.embedBatch(["Hello", "World"]);
 */

const { EventEmitter } = require('events');

// Lazy import to avoid loading heavy model at startup
let pipeline = null;
let env = null;

class EmbeddingService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      model: options.model || 'Xenova/all-MiniLM-L6-v2',
      dimensions: options.dimensions || 384,
      cacheDir: options.cacheDir || null,
      quantized: options.quantized !== false, // Use quantized by default (smaller/faster)
      ...options
    };

    this.extractor = null;
    this.initialized = false;
    this.initializing = false;

    this.stats = {
      embeddingsGenerated: 0,
      totalTokensProcessed: 0,
      averageTimeMs: 0,
      initTimeMs: 0
    };
  }

  /**
   * Initialize the embedding model
   * Downloads model on first run (~22MB)
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }

    if (this.initializing) {
      // Wait for existing initialization
      return new Promise((resolve) => {
        this.once('initialized', () => resolve(true));
      });
    }

    this.initializing = true;
    const startTime = Date.now();

    try {
      console.log(`[EmbeddingService] Loading model: ${this.config.model}`);

      // Dynamic import for ES module
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;
      env = transformers.env;

      // Configure cache directory if specified
      if (this.config.cacheDir) {
        env.cacheDir = this.config.cacheDir;
      }

      // Disable local model check to always use remote
      env.allowLocalModels = true;
      env.allowRemoteModels = true;

      // Create the feature extraction pipeline
      this.extractor = await pipeline(
        'feature-extraction',
        this.config.model,
        { quantized: this.config.quantized }
      );

      this.stats.initTimeMs = Date.now() - startTime;
      this.initialized = true;
      this.initializing = false;

      console.log(`[EmbeddingService] Model loaded in ${this.stats.initTimeMs}ms`);
      this.emit('initialized', { timeMs: this.stats.initTimeMs });

      return true;
    } catch (error) {
      this.initializing = false;
      console.error(`[EmbeddingService] Failed to load model:`, error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector (384 dimensions)
   */
  async embed(text) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      // Generate embedding
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true
      });

      // Convert to regular array
      const embedding = Array.from(output.data);

      // Update stats
      const timeMs = Date.now() - startTime;
      this.stats.embeddingsGenerated++;
      this.stats.averageTimeMs = (
        (this.stats.averageTimeMs * (this.stats.embeddingsGenerated - 1) + timeMs) /
        this.stats.embeddingsGenerated
      );

      return embedding;
    } catch (error) {
      console.error(`[EmbeddingService] Embedding failed:`, error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Array of embedding vectors
   */
  async embedBatch(texts) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    const startTime = Date.now();
    const embeddings = [];

    try {
      // Process each text (transformers.js handles batching internally)
      for (const text of texts) {
        const output = await this.extractor(text, {
          pooling: 'mean',
          normalize: true
        });
        embeddings.push(Array.from(output.data));
      }

      // Update stats
      const timeMs = Date.now() - startTime;
      this.stats.embeddingsGenerated += texts.length;

      console.log(`[EmbeddingService] Generated ${texts.length} embeddings in ${timeMs}ms`);

      return embeddings;
    } catch (error) {
      console.error(`[EmbeddingService] Batch embedding failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      initialized: this.initialized,
      model: this.config.model,
      dimensions: this.config.dimensions
    };
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.initialized;
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      model: this.config.model,
      dimensions: this.config.dimensions,
      quantized: this.config.quantized,
      initialized: this.initialized
    };
  }
}

// Singleton instance for shared use
let instance = null;

function getEmbeddingService(options = {}) {
  if (!instance) {
    instance = new EmbeddingService(options);
  }
  return instance;
}

module.exports = {
  EmbeddingService,
  getEmbeddingService
};
