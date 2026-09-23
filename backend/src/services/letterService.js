const LetterModel = require('../models/letterModel');
const UserModel = require('../models/userModel');
const FavoriteModel = require('../models/favoriteModel');
const { LETTER_STATUS, MESSAGES } = require('../config/constants');

function fail(status, message, code) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = status;
  return err;
}

// A scheduled letter has no receiver yet and must stay invisible to the
// receiver side: no replies, favorites, skips or thread access until it is
// actually delivered.
function assertNotLocked(letter) {
  if (letter.status === LETTER_STATUS.SCHEDULED || letter.status === LETTER_STATUS.DELIVERING) {
    throw fail(409, MESSAGES.LETTER_NOT_DUE, 'LOCKED');
  }
}

const LetterService = {
  sendRandom({ senderId, content, delayMs }) {
    const now = Date.now();

    // Scheduled delivery: create without a receiver. The scheduler picks a
    // random traveller when the time comes.
    if (delayMs && delayMs > 0) {
      const id = LetterModel.create({
        senderId,
        receiverId: null,
        parentId: null,
        content,
        status: LETTER_STATUS.SCHEDULED,
        createdAt: now,
        deliverAt: now + delayMs
      });
      return LetterModel.findById(id);
    }

    const other = UserModel.findRandomOther(senderId);
    if (!other) {
      throw fail(400, MESSAGES.NO_OTHER_USERS, 'NO_USERS');
    }
    const id = LetterModel.create({
      senderId,
      receiverId: other.id,
      parentId: null,
      content,
      status: LETTER_STATUS.DELIVERED,
      createdAt: now
    });
    return LetterModel.findById(id);
  },

  // Cancel a scheduled letter. Atomic conditional UPDATE means a delivery
  // racing with this call wins/loses exactly once; a cancelled row no longer
  // matches the scheduler's claim predicate and can never be delivered.
  cancelScheduled({ userId, letterId }) {
    const changed = LetterModel.cancelIfScheduled(letterId, userId);
    if (!changed) {
      const letter = LetterModel.findById(letterId);
      if (!letter || letter.sender_id !== userId) {
        throw fail(404, MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
      }
      throw fail(409, MESSAGES.LETTER_ALREADY_HANDLED, 'ALREADY_HANDLED');
    }
    return true;
  },

  // Attempt delivery of one due letter; returns a result tag for the scanner.
  // Idempotent: a second scan of the same id cannot deliver it again.
  deliverDueLetter(letter) {
    const now = Date.now();
    const claimed = LetterModel.claimForDelivery(letter.id, now);
    if (!claimed) return { id: letter.id, outcome: 'skipped' };

    const other = UserModel.findRandomOther(letter.sender_id);
    if (!other) {
      LetterModel.markDeliveryFailed(letter.id, MESSAGES.NO_OTHER_USERS);
      return { id: letter.id, outcome: 'failed', reason: MESSAGES.NO_OTHER_USERS };
    }
    LetterModel.markDelivered(letter.id, other.id, now);
    return { id: letter.id, outcome: 'delivered' };
  },

  scanDueLetters() {
    const due = LetterModel.listDueScheduled(Date.now());
    return due.map((letter) => LetterService.deliverDueLetter(letter));
  },

  reply({ userId, parentId, content }) {
    const parent = LetterModel.findById(parentId);
    if (!parent) {
      throw fail(404, MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    assertNotLocked(parent);
    const isReceiver = parent.receiver_id === userId;
    const isSender = parent.sender_id === userId;
    if (!isReceiver && !isSender) {
      throw fail(403, MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    const receiverId = isReceiver ? parent.sender_id : parent.receiver_id;

    const rootId = LetterModel.findRootByChild(parent.id);
    const root = LetterModel.findById(rootId);
    assertNotLocked(root);

    const id = LetterModel.create({
      senderId: userId,
      receiverId,
      parentId: rootId,
      content,
      status: LETTER_STATUS.REPLIED,
      createdAt: Date.now()
    });
    if (root.status === LETTER_STATUS.DELIVERED || root.status === LETTER_STATUS.PENDING) {
      LetterModel.updateStatus(root.id, LETTER_STATUS.REPLIED);
    }
    return LetterModel.findById(id);
  },

  skip({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      throw fail(404, MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    assertNotLocked(letter);
    if (letter.receiver_id !== userId) {
      throw fail(403, MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    LetterModel.updateStatus(letterId, LETTER_STATUS.SKIPPED);
    return true;
  },

  toggleFavorite({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      throw fail(404, MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    assertNotLocked(letter);
    const isParticipant = letter.sender_id === userId || letter.receiver_id === userId;
    if (!isParticipant) {
      throw fail(403, MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    const exists = FavoriteModel.exists({ userId, letterId });
    if (exists) {
      FavoriteModel.remove({ userId, letterId });
      return { favorited: false };
    }
    FavoriteModel.add({ userId, letterId, createdAt: Date.now() });
    return { favorited: true };
  },

  isFavorited({ userId, letterId }) {
    return FavoriteModel.exists({ userId, letterId });
  },

  getLetter({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter || letter.sender_id !== userId) {
      throw fail(404, MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    return LetterService._decorate(letter);
  },

  _decorate(l) {
    return {
      id: l.id,
      preview: l.content.slice(0, 80),
      content: l.content,
      status: l.status,
      createdAt: l.created_at,
      deliverAt: l.deliver_at || null,
      deliveredAt: l.delivered_at || null,
      failReason: l.fail_reason || null,
      serverTime: Date.now()
    };
  },

  listInbox(userId) {
    const rawSent = LetterModel.listSentByUser(userId);
    const rawReceived = LetterModel.listReceivedByUser(userId);
    const rawConvos = LetterModel.listConversationsForUser(userId);
    const favorites = new Set(
      FavoriteModel.listByUser(userId).map((l) => l.id)
    );
    const serverTime = Date.now();
    const decorate = (list, role) =>
      list.map((l) => ({
        id: l.id,
        preview: l.content.slice(0, 80),
        status: l.status,
        createdAt: l.created_at,
        deliverAt: l.deliver_at || null,
        deliveredAt: l.delivered_at || null,
        failReason: l.fail_reason || null,
        serverTime,
        replyCount: l.reply_count,
        role,
        favorited:
          l.status === LETTER_STATUS.SCHEDULED || l.status === LETTER_STATUS.CANCELLED
            ? false
            : favorites.has(l.id)
      }));
    return {
      sent: decorate(rawSent, 'sent'),
      received: decorate(rawReceived, 'received'),
      conversations: decorate(rawConvos, 'either')
    };
  },

  getThread({ userId, rootId }) {
    const thread = LetterModel.listThread(rootId);
    if (!thread.length) {
      throw fail(404, MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    const first = thread[0];
    assertNotLocked(first);
    if (first.sender_id !== userId && first.receiver_id !== userId) {
      throw fail(403, MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    const me = userId;
    return {
      rootId,
      favorited: FavoriteModel.exists({ userId, letterId: rootId }),
      messages: thread.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        fromMe: m.sender_id === me
      }))
    };
  }
};

module.exports = LetterService;
