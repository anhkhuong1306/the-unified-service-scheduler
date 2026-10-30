#!/usr/bin/env node
/**
 * Database SQL Script Runner
 *
 * Executes .sql files directly against PostgreSQL using node-postgres (pg).
 * Loads connection configuration from process.env or .env file.
 *
 * Usage:
 *   node scripts/run-sql.js <path-to-sql-file> [database-name]
 *
 * Examples:
 *   node scripts/run-sql.js docker/postgres/02-schema.sql
 *   node scripts/run-sql.js docker/postgres/03-seed.sql
 *   node scripts/run-sql.js docker/postgres/02-schema.sql scheduler_test
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Basic .env parser if dotenv is not loaded
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const sqlFilePath = process.argv[2];
const targetDb = process.argv[3] || process.env.DB_DATABASE || process.env.POSTGRES_DB || 'scheduler';

if (!sqlFilePath) {
  console.error('❌ Error: Missing SQL file path argument.');
  console.log('Usage: node scripts/run-sql.js <path-to-sql-file> [database]');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), sqlFilePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ Error: File not found at '${resolvedPath}'`);
  process.exit(1);
}

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || process.env.FORWARD_DB_PORT || 5432);
const user = process.env.DB_USERNAME || process.env.POSTGRES_USER || 'scheduler';
const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'secret';

console.log(`🔌 Connecting to PostgreSQL at ${host}:${port}/${targetDb} as user '${user}'...`);

const client = new Client({
  host,
  port,
  user,
  password,
  database: targetDb,
});

async function run() {
  try {
    await client.connect();
    console.log(`🚀 Executing '${path.basename(resolvedPath)}' on database '${targetDb}'...`);

    if (path.basename(resolvedPath) === '01-init.sql') {
      // Handle 01-init.sql safely without psql meta-commands
      console.log(`🔧 Ensuring btree_gist extension on '${targetDb}'...`);
      await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');

      console.log(`🔧 Ensuring 'scheduler_test' database exists...`);
      const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'scheduler_test'");
      if (res.rowCount === 0) {
        await client.query(`CREATE DATABASE scheduler_test OWNER "${user}";`);
        console.log(`✨ Created database 'scheduler_test' owned by '${user}'.`);
      }

      console.log(`🔧 Ensuring btree_gist extension on 'scheduler_test'...`);
      const testClient = new Client({ host, port, user, password, database: 'scheduler_test' });
      await testClient.connect();
      await testClient.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
      await testClient.end();

      console.log(`✅ Successfully executed '${path.basename(resolvedPath)}'!`);
      return;
    }

    let rawSql = fs.readFileSync(resolvedPath, 'utf8');

    // Strip psql metacommand like \connect scheduler
    rawSql = rawSql.replace(/^\\connect\s+.*$/gm, '-- connect omitted');

    await client.query(rawSql);

    console.log(`✅ Successfully executed '${path.basename(resolvedPath)}'!`);
  } catch (err) {
    console.error(`❌ Execution failed:`, err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run();
