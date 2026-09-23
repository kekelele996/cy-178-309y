const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const LetterService = require('../services/letterService');
const { MESSAGES, DELIVERY } = require('../config/constants');

const router = Router();
router.use(requireAuth);

function handleError(res, err) {
  const status =
    err.statusCode ||
    (err.code === 'NOT_FOUND'
      ? 404
      : err.code === 'FORBIDDEN' || err.code === 'LOCKED' || err.code === 'ALREADY_HANDLED'
        ? 409
        : err.code === 'NO_USERS'
          ? 400
          : 500);
  res.status(status).json({ error: err.message });
}

router.post('/', (req, res) => {
  try {
    const { content, delayMs } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '信件内容不能为空' });
    }
    const delay = Number(delayMs) || 0;
    if (!DELIVERY.DELAYS.includes(delay)) {
      return res.status(400).json({ error: '不支持的投递时刻' });
    }
    const letter = LetterService.sendRandom({
      senderId: req.user.id,
      content: content.trim(),
      delayMs: delay
    });
    const scheduled = delay > 0;
    res.json({
      message: scheduled ? MESSAGES.LETTER_SCHEDULED : MESSAGES.LETTER_SENT,
      id: letter.id,
      scheduled,
      deliverAt: letter.deliver_at || null
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    LetterService.cancelScheduled({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.LETTER_CANCELLED });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id', (req, res) => {
  try {
    const letter = LetterService.getLetter({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json(letter);
  } catch (err) {
    handleError(res, err);
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
    handleError(res, err);
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
    handleError(res, err);
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
    handleError(res, err);
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
    handleError(res, err);
  }
});

module.exports = router;
