/**
 * RetentionManager.js - Memory retention and cleanup strategies
 *
 * Manages memory lifecycle with TTL, access tracking, and cleanup strategies.
 *
 * Strategies:
 * - oldest_first: Remove oldest memories first
 * - lowest_confidence: Remove lowest confidence memories first
 * - expired: Remove memories past their TTL
 * - least_accessed: Remove least recently accessed memories
 */

class RetentionManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      defaultTtlDays: config.defaultTtlDays || 0, // 0 = no expiration
      defaultStrategy: config.defaultStrategy || 'expired',
      maxMemoriesPerBank: config.maxMemoriesPerBank || 10000,
      ...config
    };
  }

  /**
   * Run cleanup on a specific bank
   * @param {string} bankId - Bank to clean up
   * @param {Object} options - Cleanup options
   * @returns {Object} - Cleanup results
   */
  async cleanup(bankId, options = {}) {
    const {
      strategy = this.config.defaultStrategy,
      limit = 100,
      dryRun = false
    } = options;

    console.log(`[RetentionManager] Running ${strategy} cleanup on bank ${bankId} (dryRun=${dryRun})`);

    let result;

    switch (strategy) {
      case 'oldest_first':
        result = await this._cleanupOldest(bankId, limit, dryRun);
        break;
      case 'lowest_confidence':
        result = await this._cleanupLowConfidence(bankId, limit, dryRun);
        break;
      case 'expired':
        result = await this._cleanupExpired(bankId, dryRun);
        break;
      case 'least_accessed':
        result = await this._cleanupLeastAccessed(bankId, limit, dryRun);
        break;
      case 'over_limit':
        result = await this._cleanupOverLimit(bankId, dryRun);
        break;
      default:
        throw new Error(`Unknown cleanup strategy: ${strategy}`);
    }

    console.log(`[RetentionManager] Cleanup complete: ${result.removed} memories ${dryRun ? 'would be' : ''} removed`);
    return result;
  }

  /**
   * Remove oldest memories first
   * @private
   */
  async _cleanupOldest(bankId, limit, dryRun) {
    const memories = this.db.prepare(`
      SELECT id, created_at FROM memories
      WHERE bank_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(bankId, limit);

    if (!dryRun && memories.length > 0) {
      const ids = memories.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...ids);
    }

    return {
      strategy: 'oldest_first',
      removed: memories.length,
      memories: memories.map(m => ({ id: m.id, createdAt: m.created_at })),
      dryRun
    };
  }

  /**
   * Remove lowest confidence memories first
   * @private
   */
  async _cleanupLowConfidence(bankId, limit, dryRun) {
    const memories = this.db.prepare(`
      SELECT id, confidence FROM memories
      WHERE bank_id = ?
      ORDER BY confidence ASC
      LIMIT ?
    `).all(bankId, limit);

    if (!dryRun && memories.length > 0) {
      const ids = memories.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...ids);
    }

    return {
      strategy: 'lowest_confidence',
      removed: memories.length,
      memories: memories.map(m => ({ id: m.id, confidence: m.confidence })),
      dryRun
    };
  }

  /**
   * Remove expired memories (past their TTL)
   * @private
   */
  async _cleanupExpired(bankId, dryRun) {
    const now = new Date().toISOString();

    const memories = this.db.prepare(`
      SELECT id, expires_at FROM memories
      WHERE bank_id = ?
        AND expires_at IS NOT NULL
        AND expires_at < ?
    `).all(bankId, now);

    if (!dryRun && memories.length > 0) {
      const ids = memories.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...ids);
    }

    return {
      strategy: 'expired',
      removed: memories.length,
      memories: memories.map(m => ({ id: m.id, expiresAt: m.expires_at })),
      dryRun
    };
  }

  /**
   * Remove least recently accessed memories
   * @private
   */
  async _cleanupLeastAccessed(bankId, limit, dryRun) {
    const memories = this.db.prepare(`
      SELECT id, last_accessed_at, access_count FROM memories
      WHERE bank_id = ?
      ORDER BY COALESCE(last_accessed_at, created_at) ASC, access_count ASC
      LIMIT ?
    `).all(bankId, limit);

    if (!dryRun && memories.length > 0) {
      const ids = memories.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...ids);
    }

    return {
      strategy: 'least_accessed',
      removed: memories.length,
      memories: memories.map(m => ({
        id: m.id,
        lastAccessedAt: m.last_accessed_at,
        accessCount: m.access_count
      })),
      dryRun
    };
  }

  /**
   * Remove memories over the bank limit (keeps most recent)
   * @private
   */
  async _cleanupOverLimit(bankId, dryRun) {
    // Get bank config for limit
    const bank = this.db.prepare('SELECT config FROM banks WHERE id = ?').get(bankId);
    const bankConfig = JSON.parse(bank?.config || '{}');
    const maxMemories = bankConfig.maxMemories || this.config.maxMemoriesPerBank;

    // Count current memories
    const { count } = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE bank_id = ?').get(bankId);

    if (count <= maxMemories) {
      return {
        strategy: 'over_limit',
        removed: 0,
        memories: [],
        dryRun,
        message: `Bank has ${count} memories, under limit of ${maxMemories}`
      };
    }

    const toRemove = count - maxMemories;

    // Get oldest memories to remove
    const memories = this.db.prepare(`
      SELECT id, created_at FROM memories
      WHERE bank_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(bankId, toRemove);

    if (!dryRun && memories.length > 0) {
      const ids = memories.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...ids);
    }

    return {
      strategy: 'over_limit',
      removed: memories.length,
      memories: memories.map(m => ({ id: m.id, createdAt: m.created_at })),
      dryRun,
      message: `Removed ${memories.length} memories to stay under limit of ${maxMemories}`
    };
  }

  /**
   * Update access tracking for a memory
   * @param {string} memoryId - Memory ID
   */
  trackAccess(memoryId) {
    try {
      this.db.prepare(`
        UPDATE memories
        SET last_accessed_at = datetime('now'),
            access_count = COALESCE(access_count, 0) + 1
        WHERE id = ?
      `).run(memoryId);
    } catch (error) {
      console.error(`[RetentionManager] Failed to track access for ${memoryId}:`, error.message);
    }
  }

  /**
   * Set TTL for a memory
   * @param {string} memoryId - Memory ID
   * @param {number} ttlDays - TTL in days (0 = no expiration)
   */
  setTTL(memoryId, ttlDays) {
    const expiresAt = ttlDays > 0
      ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    this.db.prepare(`
      UPDATE memories SET expires_at = ? WHERE id = ?
    `).run(expiresAt, memoryId);
  }

  /**
   * Get retention statistics for a bank
   * @param {string} bankId - Bank ID
   */
  getStats(bankId) {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE bank_id = ?').get(bankId);
    const expired = this.db.prepare(`
      SELECT COUNT(*) as count FROM memories
      WHERE bank_id = ? AND expires_at IS NOT NULL AND expires_at < datetime('now')
    `).get(bankId);
    const withTTL = this.db.prepare(`
      SELECT COUNT(*) as count FROM memories
      WHERE bank_id = ? AND expires_at IS NOT NULL
    `).get(bankId);

    // Get bank config for limit
    const bank = this.db.prepare('SELECT config FROM banks WHERE id = ?').get(bankId);
    const bankConfig = JSON.parse(bank?.config || '{}');
    const maxMemories = bankConfig.maxMemories || this.config.maxMemoriesPerBank;

    return {
      bankId,
      totalMemories: total.count,
      maxMemories,
      memoriesWithTTL: withTTL.count,
      expiredMemories: expired.count,
      atCapacity: total.count >= maxMemories
    };
  }
}

module.exports = { RetentionManager };
