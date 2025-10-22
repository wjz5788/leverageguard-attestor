import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(SERVICE_ROOT, '..', '..');

// Database path from environment variables or default
const DB_PATH = path.resolve(SERVICE_ROOT, process.env.DB_PATH ?? './data/us.sqlite');

// Ensure the database directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Initialize the database connection
const db = new Database(DB_PATH);

// Enable WAL (Write-Ahead Logging) mode for better concurrency
db.pragma('journal_mode = WAL');

// Run migrations
const migratePath = path.resolve(WORKSPACE_ROOT, 'scripts', 'migrate.sql');
if (fs.existsSync(migratePath)) {
  const migrationScript = fs.readFileSync(migratePath, 'utf8');
  db.exec(migrationScript);
  console.log('[db] Migrations executed successfully.');
}

console.log(`[db] Connected to SQLite database at ${DB_PATH}`);

export default db;
