const LetterModel = require('../models/letterModel');
const UserModel = require('../models/userModel');
const FavoriteModel = require('../models/favoriteModel');
const { LETTER_STATUS, MESSAGES } = require('../config/constants');

const LetterService = {
  sendRandom({ senderId, content, delayMs }) {
    const now = Date.now();

    if (delayMs) {
      // 定时信件：此刻不挑选收件人，任何人都接触不到，只挂在寄件人“发出的”里
      const id = LetterModel.create({
        senderId,
        receiverId: null,
        parentId: null,
        content,
        status: LETTER_STATUS.PENDING,
        deliverAt: now + delayMs,
        createdAt: now
      });
      return { letter: LetterModel.findById(id), scheduled: true };
    }

    const other = UserModel.findRandomOther(senderId);
    if (!other) {
      const err = new Error(MESSAGES.NO_OTHER_USERS);
      err.code = 'NO_USERS';
      throw err;
    }
    const id = LetterModel.create({
      senderId,
      receiverId: other.id,
      parentId: null,
      content,
      status: LETTER_STATUS.DELIVERED,
      createdAt: now
    });
    return { letter: LetterModel.findById(id), scheduled: false };
  },

  cancel({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter || letter.sender_id !== userId) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (!letter.deliver_at) {
      const err = new Error(MESSAGES.NOT_SCHEDULED);
      err.code = 'CONFLICT';
      throw err;
    }
    // 条件更新保证：取消与到点投递并发时只能有一方成功
    const cancelled = LetterModel.cancelPending({ id: letterId, senderId: userId });
    if (!cancelled) {
      const err = new Error(MESSAGES.CANCEL_CONFLICT);
      err.code = 'CONFLICT';
      throw err;
    }
    return true;
  },

  // 扫描并投递单封到期信件；返回结果便于测试与日志
  processDueLetter(letter, now = Date.now()) {
    if (letter.status !== LETTER_STATUS.PENDING || !letter.deliver_at) {
      return { id: letter.id, outcome: 'skip' };
    }
    if (letter.deliver_at > now) {
      return { id: letter.id, outcome: 'waiting' };
    }

    const other = UserModel.findRandomOther(letter.sender_id);
    if (!other) {
      // 投递失败：保留待投状态和原因，等下一轮扫描重试
      LetterModel.markFailure(letter.id, MESSAGES.NO_OTHER_USERS);
      return { id: letter.id, outcome: 'failed', reason: MESSAGES.NO_OTHER_USERS };
    }

    // 原子抢占：重复扫描或并发取消都只能有一个结果
    const won = LetterModel.markDelivered({ id: letter.id, receiverId: other.id });
    if (!won) {
      return { id: letter.id, outcome: 'lost' };
    }
    return { id: letter.id, outcome: 'delivered', receiverId: other.id };
  },

  scanDue(now = Date.now()) {
    return LetterModel.listDue(now).map((letter) =>
      LetterService.processDueLetter(letter, now)
    );
  },

  reply({ userId, parentId, content }) {
    const parent = LetterModel.findById(parentId);
    if (!parent) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const isReceiver = parent.receiver_id === userId;
    const isSender = parent.sender_id === userId;
    if (!isReceiver && !isSender) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
    }

    const rootId = LetterModel.findRootByChild(parent.id);
    const root = LetterModel.findById(rootId);
    // 定时信件在真正投递前（待投或已取消）不允许形成回复
    if (
      root &&
      root.deliver_at &&
      (root.status === LETTER_STATUS.PENDING || root.status === LETTER_STATUS.CANCELLED)
    ) {
      const err = new Error(MESSAGES.LETTER_NOT_DELIVERED);
      err.code = 'CONFLICT';
      throw err;
    }

    const receiverId = isReceiver ? parent.sender_id : parent.receiver_id;

    const id = LetterModel.create({
      senderId: userId,
      receiverId,
      parentId: rootId,
      content,
      status: LETTER_STATUS.REPLIED,
      createdAt: Date.now()
    });
    if (parent.status === LETTER_STATUS.DELIVERED || parent.status === LETTER_STATUS.PENDING) {
      LetterModel.updateStatus(parent.id, LETTER_STATUS.REPLIED);
    }
    return LetterModel.findById(id);
  },

  skip({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (letter.receiver_id !== userId) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    LetterModel.updateStatus(letterId, LETTER_STATUS.SKIPPED);
    return true;
  },

  toggleFavorite({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    // 定时信件在真正投递前（待投或已取消），任何人都不能收藏
    const participant = letter.sender_id === userId || letter.receiver_id === userId;
    const scheduledButNotDelivered =
      letter.deliver_at &&
      (letter.status === LETTER_STATUS.PENDING || letter.status === LETTER_STATUS.CANCELLED);
    if (!participant || scheduledButNotDelivered) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
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

  listInbox(userId) {
    const rawSent = LetterModel.listSentByUser(userId);
    const rawReceived = LetterModel.listReceivedByUser(userId);
    const rawConvos = LetterModel.listConversationsForUser(userId);
    const favorites = new Set(
      FavoriteModel.listByUser(userId).map((l) => l.id)
    );
    const decorate = (list, role) =>
      list.map((l) => ({
        id: l.id,
        preview: l.content.slice(0, 80),
        status: l.status,
        createdAt: l.created_at,
        deliverAt: l.deliver_at,
        failureReason: l.failure_reason,
        replyCount: l.reply_count,
        role,
        favorited: favorites.has(l.id)
      }));
    return {
      sent: decorate(rawSent, 'sent'),
      received: decorate(rawReceived, 'received'),
      conversations: decorate(rawConvos, 'either')
    };
  },

  getLetterStatus({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter || letter.sender_id !== userId) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    return {
      id: letter.id,
      status: letter.status,
      createdAt: letter.created_at,
      deliverAt: letter.deliver_at,
      failureReason: letter.failure_reason
    };
  },

  getThread({ userId, rootId }) {
    const thread = LetterModel.listThread(rootId);
    if (!thread.length) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const first = thread[0];
    if (first.sender_id !== userId && first.receiver_id !== userId) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    // 定时信件在真正投递前（待投或已取消）不允许打开对话
    if (
      first.deliver_at &&
      (first.status === LETTER_STATUS.PENDING || first.status === LETTER_STATUS.CANCELLED)
    ) {
      const err = new Error(MESSAGES.LETTER_NOT_DELIVERED);
      err.code = 'CONFLICT';
      throw err;
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
