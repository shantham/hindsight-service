#!/usr/bin/env node
/**
 * Migrate data from embedded Hindsight to standalone service
 * Run this from the hindsight-service directory (has sql.js dependency)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const OLD_DB_PATH = '/Users/shantham/WIGTrade/healix-agent-comms/.hindsight-embedded-backup/data/hindsight.db';
const NEW_SERVICE_URL = 'http://localhost:8765';

async function migrate() {
  console.log('='.repeat(60));
  console.log('Hindsight Data Migration (Embedded → Standalone)');
  console.log('='.repeat(60));
  console.log(`Old DB: ${OLD_DB_PATH}`);
  console.log(`New Service: ${NEW_SERVICE_URL}`);
  console.log('');

  // Initialize sql.js
  const SQL = await initSqlJs();

  // Load old database
  const dbBuffer = fs.readFileSync(OLD_DB_PATH);
  const db = new SQL.Database(dbBuffer);

  // Get all banks
  const banksStmt = db.prepare('SELECT id, name, description FROM banks');
  const banks = [];
  while (banksStmt.step()) {
    banks.push(banksStmt.getAsObject());
  }
  banksStmt.free();

  console.log(`Found ${banks.length} banks to migrate`);

  let totalImported = 0;

  for (const bank of banks) {
    console.log('');
    console.log('-'.repeat(40));
    console.log(`Bank: ${bank.id} (${bank.name})`);

    // Get memories for this bank
    const memStmt = db.prepare(`
      SELECT id, content, type, confidence, source, tags, story_id, stage,
             embedding, entities, facts, metadata, created_at
      FROM memories WHERE bank_id = ?
    `);
    memStmt.bind([bank.id]);

    const memories = [];
    while (memStmt.step()) {
      const row = memStmt.getAsObject();
      memories.push({
        id: row.id,
        content: row.content,
        type: row.type,
        confidence: row.confidence,
        source: row.source,
        tags: row.tags ? JSON.parse(row.tags) : [],
        story_id: row.story_id,
        stage: row.stage,
        embedding: row.embedding ? JSON.parse(row.embedding) : [],
        entities: row.entities ? JSON.parse(row.entities) : [],
        facts: row.facts ? JSON.parse(row.facts) : [],
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        created_at: row.created_at
      });
    }
    memStmt.free();

    console.log(`  Memories: ${memories.length}`);

    if (memories.length === 0) {
      console.log('  Skipping (no memories)');
      continue;
    }

    // Prepare import data
    const importData = {
      data: {
        bank: {
          id: bank.id,
          name: bank.name,
          description: bank.description
        },
        memories: memories
      },
      merge: true
    };

    // Import via API
    try {
      const response = await fetch(`${NEW_SERVICE_URL}/banks/${bank.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData)
      });

      if (!response.ok) {
        const err = await response.text();
        console.log(`  ERROR: ${err}`);
        continue;
      }

      const result = await response.json();
      console.log(`  Imported: ${result.imported} memories`);
      totalImported += result.imported;
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  db.close();

  console.log('');
  console.log('='.repeat(60));
  console.log(`Migration complete! Total imported: ${totalImported}`);
  console.log('='.repeat(60));

  // Verify
  console.log('');
  console.log('Verifying...');
  const statsResponse = await fetch(`${NEW_SERVICE_URL}/stats`);
  const stats = await statsResponse.json();
  console.log(`Banks: ${stats.banks}`);
  console.log(`Memories: ${stats.memories}`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
