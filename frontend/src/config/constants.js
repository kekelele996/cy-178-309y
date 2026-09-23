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
  LETTER: (id) => `${API_BASE}/api/letters/${id}`,
  CANCEL_LETTER: (id) => `${API_BASE}/api/letters/${id}/cancel`,
  REPLY_LETTER: (id) => `${API_BASE}/api/letters/${id}/reply`,
  SKIP_LETTER: (id) => `${API_BASE}/api/letters/${id}/skip`,
  FAVORITE_LETTER: (id) => `${API_BASE}/api/letters/${id}/favorite`,
  THREAD: (id) => `${API_BASE}/api/letters/${id}/thread`,
  INBOX: `${API_BASE}/api/inbox`
};

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
  PENDING: '/pending/:id',
  THREAD: '/thread/:id'
};

// Sending-time choices for a letter. value is the delay in milliseconds
// sent to the backend; 0 means the original instant delivery.
export const DELIVERY_OPTIONS = [
  { value: 0, label: '立即送出' },
  { value: 60 * 1000, label: '1 分钟后' },
  { value: 60 * 60 * 1000, label: '1 小时后' },
  { value: 24 * 60 * 60 * 1000, label: '1 天后' }
];

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
  SEND_WHEN: '投递时刻',
  CANCEL_DELIVERY: '取消投递',
  CANCEL_CONFIRM: '确定取消这封信的投递吗？取消后它将不会被送出。',
  CANCELLING: '取消中…',
  SCHEDULED_HINT: '信已封存在驿站，到点才会上路。在此之前只有你能看到它。',
  CANCELLED_HINT: '这封信已取消投递，不会再送出。',
  DELIVERED_HINT: '信已上路，随机落在一位陌生旅人的信箱里。',
  DELIVERY_FAIL_HINT: '暂时投不出去，驿站会继续为你保留，稍后再试。',
  REMAINING: '剩余',
  CANCELLED: '已取消',
  WAITING: '待投递',
  IN_DELIVERY: '投递中',
  DELIVERY_FAILED: '投递失败',
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
  scheduled: '待投递',
  cancelled: '已取消',
  delivering: '投递中'
};

// Format a remaining-duration ms value as e.g. "23:59:05" / "58" / "0".
export function formatRemaining(ms) {
  if (ms <= 0) return '0 秒';
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) return `${days} 天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (minutes > 0) return `${pad(minutes)}:${pad(seconds)}`;
  return `${seconds} 秒`;
}
