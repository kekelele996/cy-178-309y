const db = require('../data/database');

const LetterModel = {
  create({ senderId, receiverId, parentId, content, status, createdAt, deliverAt }) {
    const stmt = db.prepare(
      `INSERT INTO letters
         (sender_id, receiver_id, parent_id, content, status, created_at, deliver_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      senderId,
      receiverId == null ? null : receiverId,
      parentId || null,
      content,
      status,
      createdAt,
      deliverAt || null
    );
    return info.lastInsertRowid;
  },

  findById(id) {
    return db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  },

  findRootByChild(id) {
    const row = db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id) AS (
           SELECT id, parent_id FROM letters WHERE id = ?
           UNION ALL
           SELECT l.id, l.parent_id FROM letters l
           INNER JOIN chain c ON l.id = c.parent_id
         )
         SELECT id FROM chain WHERE parent_id IS NULL`
      )
      .get(id);
    return row ? row.id : id;
  },

  updateStatus(id, status) {
    return db.prepare('UPDATE letters SET status = ? WHERE id = ?').run(status, id);
  },

  // Scheduled letters that have reached their delivery time.
  listDueScheduled(now, limit = 50) {
    return db
      .prepare(
        `SELECT * FROM letters
         WHERE status = 'scheduled' AND deliver_at IS NOT NULL AND deliver_at <= ?
         ORDER BY deliver_at ASC
         LIMIT ?`
      )
      .all(now, limit);
  },

  // Atomic cancel: wins only if the letter is still scheduled and owned by
  // the sender. Returns 1 when the cancellation wins, 0 when delivery (or a
  // previous cancel) has already claimed the row.
  cancelIfScheduled(id, senderId) {
    const info = db
      .prepare(
        `UPDATE letters
         SET status = 'cancelled'
         WHERE id = ? AND sender_id = ? AND status = 'scheduled'`
      )
      .run(id, senderId);
    return info.changes;
  },

  // Atomic claim of a due letter. Re-checking status + deliver_at inside the
  // UPDATE makes repeated scans a no-op and races the cancel endpoint: only
  // one of the two can ever change the row.
  claimForDelivery(id, now) {
    const info = db
      .prepare(
        `UPDATE letters
         SET status = 'delivering'
         WHERE id = ? AND status = 'scheduled' AND deliver_at <= ?`
      )
      .run(id, now);
    return info.changes;
  },

  // Complete delivery: bind a receiver and mark delivered.
  markDelivered(id, receiverId, deliveredAt) {
    return db
      .prepare(
        `UPDATE letters
         SET status = 'delivered', receiver_id = ?, delivered_at = ?, fail_reason = NULL
         WHERE id = ? AND status = 'delivering'`
      )
      .run(receiverId, deliveredAt, id);
  },

  // Delivery failed (e.g. no other travellers yet): keep it pending for the
  // next scan and remember why.
  markDeliveryFailed(id, reason) {
    return db
      .prepare(
        `UPDATE letters
         SET status = 'scheduled', fail_reason = ?
         WHERE id = ? AND status = 'delivering'`
      )
      .run(reason, id);
  },

  listSentByUser(userId) {
    return db
      .prepare(
        `SELECT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.sender_id = ? AND l.parent_id IS NULL
         ORDER BY l.created_at DESC`
      )
      .all(userId);
  },

  listReceivedByUser(userId) {
    return db
      .prepare(
        `SELECT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.receiver_id = ?
           AND l.parent_id IS NULL
           AND l.status NOT IN ('scheduled', 'cancelled')
         ORDER BY l.created_at DESC`
      )
      .all(userId);
  },

  listConversationsForUser(userId) {
    return db
      .prepare(
        `SELECT DISTINCT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.parent_id IS NULL
           AND l.status NOT IN ('scheduled', 'cancelled')
           AND (l.sender_id = ? OR l.receiver_id = ?)
           AND EXISTS (
             SELECT 1 FROM letters c WHERE c.parent_id = l.id
           )
         ORDER BY l.created_at DESC`
      )
      .all(userId, userId);
  },

  listThread(rootId) {
    return db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id, depth) AS (
           SELECT id, parent_id, 0 FROM letters WHERE id = ?
           UNION ALL
           SELECT l.id, l.parent_id, c.depth + 1 FROM letters l
           INNER JOIN chain c ON l.parent_id = c.id
         )
         SELECT l.* FROM letters l
         INNER JOIN chain c ON l.id = c.id
         ORDER BY c.depth ASC, l.created_at ASC`
      )
      .all(rootId);
  }
};

module.exports = LetterModel;
