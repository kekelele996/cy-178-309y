const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const LetterService = require('../services/letterService');
const { MESSAGES, SCHEDULE_DELAYS, SCHEDULE_EXTRA_DELAYS } = require('../config/constants');

const router = Router();
router.use(requireAuth);

const VALID_DELAYS = new Set([
  SCHEDULE_DELAYS.MINUTE,
  SCHEDULE_DELAYS.HOUR,
  SCHEDULE_DELAYS.DAY,
  ...SCHEDULE_EXTRA_DELAYS
]);

router.post('/', (req, res) => {
  try {
    const { content, delayMs } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '信件内容不能为空' });
    }

    const delay = Number(delayMs) || 0;
    if (delay && !VALID_DELAYS.has(delay)) {
      return res.status(400).json({ error: MESSAGES.INVALID_DELAY });
    }

    const { letter, scheduled } = LetterService.sendRandom({
      senderId: req.user.id,
      content: content.trim(),
      delayMs: delay
    });
    res.status(scheduled ? 202 : 200).json({
      message: scheduled ? MESSAGES.LETTER_SCHEDULED : MESSAGES.LETTER_SENT,
      id: letter.id,
      scheduled,
      deliverAt: letter.deliver_at
    });
  } catch (err) {
    const status =
      err.code === 'NO_USERS'
        ? 400
        : err.code === 'NOT_FOUND'
          ? 404
          : err.code === 'FORBIDDEN'
            ? 403
            : err.code === 'CONFLICT'
              ? 409
              : 500;
    res.status(status).json({ error: err.message });
  }
});

// 寄件人查看定时信件的状态与剩余时间（写信页刷新后恢复）
router.get('/:id/status', (req, res) => {
  try {
    const status = LetterService.getLetterStatus({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json(status);
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    LetterService.cancel({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.LETTER_CANCELLED });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'CONFLICT' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/reply', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '回复内容不能为空' });
    }
    const reply = LetterService.reply({
      userId: req.user.id,
      parentId: Number(req.params.id),
      content: content.trim()
    });
    res.json({ message: MESSAGES.REPLIED, id: reply.id });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN'
          ? 403
          : err.code === 'CONFLICT'
            ? 409
            : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/skip', (req, res) => {
  try {
    LetterService.skip({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.SKIPPED });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/favorite', (req, res) => {
  try {
    const result = LetterService.toggleFavorite({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({
      message: result.favorited ? MESSAGES.FAVORITED : MESSAGES.UNFAVORITED,
      favorited: result.favorited
    });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/:id/thread', (req, res) => {
  try {
    const thread = LetterService.getThread({
      userId: req.user.id,
      rootId: Number(req.params.id)
    });
    res.json(thread);
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN'
          ? 403
          : err.code === 'CONFLICT'
            ? 409
            : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
