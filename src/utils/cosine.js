/**
 * Cosine similarity utilities for vector comparison
 */

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} - Similarity score (0 to 1 for normalized vectors)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Find top-k most similar items from a list
 * @param {number[]} queryEmbedding - Query vector
 * @param {Array<{embedding: number[], ...}>} items - Items with embeddings
 * @param {number} topK - Number of results to return
 * @param {number} threshold - Minimum similarity score (0-1)
 * @returns {Array<{item: any, score: number}>} - Top matching items with scores
 */
function findTopK(queryEmbedding, items, topK = 10, threshold = 0.1) {
  const scored = items.map(item => ({
    item,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }));

  return scored
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

module.exports = {
  cosineSimilarity,
  findTopK
};
