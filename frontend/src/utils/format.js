// 时间展示工具：信箱页与写信页共用，保证口径一致

export function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRemain(diffMs) {
  const s = Math.max(0, Math.ceil(diffMs / 1000));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${pad(minutes)} 分`;
  if (minutes > 0) return `${minutes} 分 ${pad(seconds)} 秒`;
  return `${seconds} 秒`;
}
