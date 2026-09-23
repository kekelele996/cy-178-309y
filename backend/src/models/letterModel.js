const db = require('../data/database');

const LetterModel = {
  create({ senderId, receiverId, parentId, content, status, deliverAt, failureReason, createdAt }) {
    const stmt = db.prepare(
      `INSERT INTO letters
        (sender_id, receiver_id, parent_id, content, status, deliver_at, failure_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      senderId,
      receiverId == null ? null : receiverId,
      parentId || null,
      content,
      status,
      deliverAt == null ? null : deliverAt,
      failureReason || null,
      createdAt
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

  // 到点的待投信件（仍未取消、仍未投出）
  listDue(now) {
    return db
      .prepare(
        `SELECT * FROM letters
         WHERE status = 'pending'
           AND deliver_at IS NOT NULL
           AND deliver_at <= ?
         ORDER BY deliver_at ASC`
      )
      .all(now);
  },

  // 原子抢占：只有仍处于待投状态的信件会被更新，重复扫描不会投第二次
  markDelivered({ id, receiverId }) {
    const info = db
      .prepare(
        `UPDATE letters
         SET receiver_id = ?, status = 'delivered', failure_reason = NULL
         WHERE id = ? AND status = 'pending' AND deliver_at IS NOT NULL`
      )
      .run(receiverId, id);
    return info.changes === 1;
  },

  // 投递失败：保留待投状态与原因，等待下次扫描重试
  markFailure(id, reason) {
    db.prepare(
      `UPDATE letters SET failure_reason = ?
       WHERE id = ? AND status = 'pending' AND deliver_at IS NOT NULL`
    ).run(reason, id);
  },

  // 原子取消：与到点投递竞争同一行，只有一方能成功
  cancelPending({ id, senderId }) {
    const info = db
      .prepare(
        `UPDATE letters
         SET status = 'cancelled'
         WHERE id = ? AND sender_id = ? AND status = 'pending' AND deliver_at IS NOT NULL`
      )
      .run(id, senderId);
    return info.changes === 1;
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
           AND l.status != 'cancelled'
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
           AND (l.sender_id = ? OR l.receiver_id = ?)
           AND l.status != 'cancelled'
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
