// Global constants configuration — keep all string literals in one place
module.exports = {
  PORTS: {
    FRONTEND: Number(process.env.FRONTEND_PORT) || 8178,
    BACKEND: Number(process.env.PORT || process.env.BACKEND_PORT) || 9178,
    DATABASE: Number(process.env.DB_PORT) || 10178
  },

  DB: {
    FILE: process.env.SQLITE_PATH || 'data/letter_pigeon.db'
  },

  JWT: {
    SECRET: process.env.JWT_SECRET || 'letter-pigeon-dev-secret-change-me',
    EXPIRY: '7d'
  },

  ROUTES: {
    AUTH: '/api/auth',
    LETTERS: '/api/letters',
    INBOX: '/api/inbox'
  },

  LETTER_STATUS: {
    PENDING: 'pending',
    DELIVERED: 'delivered',
    SKIPPED: 'skipped',
    REPLIED: 'replied',
    CANCELLED: 'cancelled'
  },

  // 定时投递可选择的延迟（毫秒）
  SCHEDULE_DELAYS: {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000
  },

  // 白名单额外允许的延迟（逗号分隔毫秒），仅用于测试，默认不放开
  SCHEDULE_EXTRA_DELAYS: (process.env.SCHEDULE_EXTRA_DELAYS || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0),

  // 后台扫描到期待投信件的间隔（毫秒）
  SCHEDULER_INTERVAL_MS: Number(process.env.SCHEDULER_INTERVAL_MS) || 5000,

  ROLES: {
    SENDER: 'sender',
    RECEIVER: 'receiver'
  },

  CATEGORIES: {
    SENT: 'sent',
    RECEIVED: 'received',
    CONVERSATIONS: 'conversations'
  },

  MESSAGES: {
    USERNAME_TAKEN: '该笔名已被占用',
    REGISTER_OK: '注册成功',
    LOGIN_FAIL: '笔名或密码错误',
    UNAUTHORIZED: '请先登录',
    NO_OTHER_USERS: '驿站暂时还没有其他旅人，再等等吧',
    LETTER_NOT_FOUND: '信件不存在',
    NOT_YOUR_LETTER: '这不是你的信件',
    LETTER_SENT: '信件已投入驿站',
    FAVORITED: '已收藏',
    UNFAVORITED: '已取消收藏',
    SKIPPED: '已跳过这封信',
    REPLIED: '回复已送达',
    LETTER_SCHEDULED: '信件已登记，将在约定时刻送出',
    INVALID_DELAY: '只能选择 1 分钟、1 小时或 1 天后投递',
    LETTER_CANCELLED: '已取消投递',
    CANCEL_CONFLICT: '信件已投出或已取消，操作未生效',
    NOT_SCHEDULED: '这封信不在待投状态',
    LETTER_NOT_DELIVERED: '信件尚未投递'
  }
};
