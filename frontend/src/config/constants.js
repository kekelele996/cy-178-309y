// Global string constants and endpoints — single source of truth

export const PORTS = {
  FRONTEND: 8178,
  BACKEND: 9178,
  DATABASE: 10178
};

export const API_BASE = '';

export const ENDPOINTS = {
  REGISTER: `${API_BASE}/api/auth/register`,
  LOGIN: `${API_BASE}/api/auth/login`,
  ME: `${API_BASE}/api/auth/me`,
  SEND_LETTER: `${API_BASE}/api/letters`,
  LETTER_STATUS: (id) => `${API_BASE}/api/letters/${id}/status`,
  CANCEL_LETTER: (id) => `${API_BASE}/api/letters/${id}/cancel`,
  REPLY_LETTER: (id) => `${API_BASE}/api/letters/${id}/reply`,
  SKIP_LETTER: (id) => `${API_BASE}/api/letters/${id}/skip`,
  FAVORITE_LETTER: (id) => `${API_BASE}/api/letters/${id}/favorite`,
  THREAD: (id) => `${API_BASE}/api/letters/${id}/thread`,
  INBOX: `${API_BASE}/api/inbox`
};

// 定时投递选项，毫秒值与后端保持一致
export const SCHEDULE_OPTIONS = [
  { value: 0, label: '立即送出' },
  { value: 60 * 1000, label: '1 分钟后' },
  { value: 60 * 60 * 1000, label: '1 小时后' },
  { value: 24 * 60 * 60 * 1000, label: '1 天后' }
];

export const STORAGE_KEYS = {
  TOKEN: 'lp_token',
  PEN_NAME: 'lp_pen_name'
};

export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  HOME: '/',
  COMPOSE: '/compose',
  INBOX: '/inbox',
  THREAD: '/thread/:id'
};

export const LABELS = {
  APP_TITLE: '信件驿站',
  APP_SUBTITLE: '写给陌生人的一封信',
  LOGIN_HINT: '用你的笔名继续未读完的信',
  REGISTER_HINT: '起一个笔名，匿名穿梭于驿站',
  PEN_NAME: '笔名',
  PASSWORD: '密码',
  LOGIN: '登录',
  REGISTER: '注册',
  SWITCH_TO_LOGIN: '已有笔名？去登录',
  SWITCH_TO_REGISTER: '没有笔名？去注册',
  LOGOUT: '退出',
  COMPOSE: '投一封信',
  MY_INBOX: '我的信箱',
  SENT: '发出的',
  RECEIVED: '收到的',
  CONVERSATIONS: '对话中',
  FAVORITE: '收藏',
  UNFAVORITE: '取消收藏',
  REPLY: '回复',
  SKIP: '跳过',
  SEND: '投入驿站',
  DELIVERY_TIME: '投递时刻',
  SCHEDULED_TITLE: '信件已封存',
  SCHEDULED_HINT: '到点前只有你能看到它，也可以随时取消。',
  WAITING_SEND: '等待投递',
  DELIVER_AT: '将于',
  REMAINING: '剩余',
  CANCEL_DELIVERY: '取消投递',
  CANCEL_CONFIRM: '确定取消这封信的投递吗？取消后无法恢复。',
  DELIVERY_FAILED: '投递暂未成功',
  DELIVERY_DONE: '已随机投给一位旅人',
  DELIVERY_CANCELLED: '投递已取消',
  RETRY_HINT: '驿站会继续尝试投递',
  CONTENT_PLACEHOLDER: '写下此刻想对陌生人说的话……',
  EMPTY_SENT: '还没有寄出的信',
  EMPTY_RECEIVED: '信箱空空，等一封信',
  EMPTY_CONVERSATIONS: '没有在持续的对话',
  BACK: '返回',
  REPLY_PLACEHOLDER: '回信给这位陌生人……',
  SUBMIT_REPLY: '寄出回复',
  SENT_FROM_ME: '我寄出',
  SENT_FROM_STRANGER: '陌生人'
};

export const STATUS_TEXT = {
  pending: '待处理',
  delivered: '已送达',
  skipped: '已跳过',
  replied: '已回复',
  cancelled: '已取消'
};
