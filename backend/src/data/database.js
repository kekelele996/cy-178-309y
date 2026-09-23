const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB } = require('../config/constants');

const dbFile = path.isAbsolute(DB.FILE) ? DB.FILE : path.join(__dirname, '..', '..', DB.FILE);
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

// Schema for fresh installs
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pen_name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER,
    parent_id INTEGER,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    deliver_at INTEGER,
    delivered_at INTEGER,
    fail_reason TEXT,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES letters(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    letter_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, letter_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_letters_sender ON letters(sender_id);
  CREATE INDEX IF NOT EXISTS idx_letters_receiver ON letters(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_letters_parent ON letters(parent_id);
  CREATE INDEX IF NOT EXISTS idx_letters_schedule
    ON letters(status, deliver_at)
    WHERE status = 'scheduled';
`;

// Migrate an existing letters table (created before scheduled delivery)
function migrateLetters() {
  const columns = db.prepare('PRAGMA table_info(letters)').all();
  if (!columns.length) return;
  const has = (name) => columns.some((c) => c.name === name);
  if (has('deliver_at') && has('delivered_at') && has('fail_reason')) return;

  // receiver_id may be NOT NULL on legacy installs; recreate the table to
  // relax it, since SQLite cannot ALTER an existing column constraint.
  const rebuild = columns.some((c) => c.name === 'receiver_id' && c.notnull);

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    if (rebuild) {
      // Rebuilt table already contains the new scheduled-delivery columns.
      db.exec(`
        CREATE TABLE letters_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER NOT NULL,
          receiver_id INTEGER,
          parent_id INTEGER,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          deliver_at INTEGER,
          delivered_at INTEGER,
          fail_reason TEXT
        );
        INSERT INTO letters_new
          (id, sender_id, receiver_id, parent_id, content, status, created_at)
        SELECT id, sender_id, receiver_id, parent_id, content, status, created_at
        FROM letters;
        DROP TABLE letters;
        ALTER TABLE letters_new RENAME TO letters;
      `);
      db.exec('COMMIT');
      return;
    }
    if (!has('deliver_at')) db.exec('ALTER TABLE letters ADD COLUMN deliver_at INTEGER');
    if (!has('delivered_at')) db.exec('ALTER TABLE letters ADD COLUMN delivered_at INTEGER');
    if (!has('fail_reason')) db.exec('ALTER TABLE letters ADD COLUMN fail_reason TEXT');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

db.pragma('foreign_keys = ON');
migrateLetters();
db.exec(SCHEMA);

module.exports = db;
