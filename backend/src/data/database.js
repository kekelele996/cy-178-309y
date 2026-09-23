const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB } = require('../config/constants');

const dbFile = path.isAbsolute(DB.FILE) ? DB.FILE : path.join(__dirname, '..', '..', DB.FILE);
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.exec(`
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
    deliver_at INTEGER,
    failure_reason TEXT,
    created_at INTEGER NOT NULL,
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
  CREATE INDEX IF NOT EXISTS idx_letters_due
    ON letters(deliver_at)
    WHERE status = 'pending' AND deliver_at IS NOT NULL;
`);

// 老库里 receiver_id 为 NOT NULL，定时信件在送出前没有收件人，需要放宽
function migrateLettersTable() {
  const columns = db.prepare('PRAGMA table_info(letters)').all();
  if (!columns.length) return;

  const hasDeliverAt = columns.some((c) => c.name === 'deliver_at');
  const hasFailureReason = columns.some((c) => c.name === 'failure_reason');
  const receiverNullable = columns.some(
    (c) => c.name === 'receiver_id' && c.notnull === 0
  );

  if (hasDeliverAt && hasFailureReason && receiverNullable) return;

  db.pragma('foreign_keys = OFF');
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE letters_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER,
        parent_id INTEGER,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        deliver_at INTEGER,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id),
        FOREIGN KEY (parent_id) REFERENCES letters(id)
      );

      INSERT INTO letters_new
        (id, sender_id, receiver_id, parent_id, content, status, deliver_at, failure_reason, created_at)
      SELECT
        id, sender_id, receiver_id, parent_id, content, status,
        ${hasDeliverAt ? 'deliver_at' : 'NULL'},
        ${hasFailureReason ? 'failure_reason' : 'NULL'},
        created_at
      FROM letters;

      DROP TABLE letters;
      ALTER TABLE letters_new RENAME TO letters;

      CREATE INDEX IF NOT EXISTS idx_letters_sender ON letters(sender_id);
      CREATE INDEX IF NOT EXISTS idx_letters_receiver ON letters(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_letters_parent ON letters(parent_id);
      CREATE INDEX IF NOT EXISTS idx_letters_due
        ON letters(deliver_at)
        WHERE status = 'pending' AND deliver_at IS NOT NULL;
    `);
  });
  migrate();
  db.pragma('foreign_keys = ON');
}

migrateLettersTable();
db.pragma('foreign_keys = ON');

module.exports = db;
