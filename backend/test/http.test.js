// HTTP 端到端：起真实服务，验证定时投递、取消、状态、隔离与原有功能
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB_FILE = 'test-tmp/http.db';
const PORT = 19880;
for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
  try { fs.unlinkSync(path.join(__dirname, '..', f)); } catch (_e) { /* ignore */ }
}

const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(PORT),
    SQLITE_PATH: DB_FILE,
    JWT_SECRET: 'http-test',
    DB_PORT: '19996',
    SCHEDULER_INTERVAL_MS: '500',
    SCHEDULE_EXTRA_DELAYS: '1500'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

async function req(url, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { status: res.status, data };
}

async function waitFor(predicate, { timeout = 15000, interval = 300, label } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await predicate();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  assert(false, `超时等待：${label}`);
  return last;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(name) {
  const r = await req('/api/auth/register', {
    method: 'POST',
    body: { penName: name, password: 'pw123456' }
  });
  return r.data.token;
}

async function main() {
  // 等服务起来
  await waitFor(async () => {
    try {
      const r = await fetch(`${BASE}/health`);
      return r.ok;
    } catch (_e) { return false; }
  }, { label: 'server start' });

  console.log('1) 注册与即时投递（原有功能）');
  const tokenA = await register('http-甲');
  const tokenB = await register('http-乙');

  const instant = await req('/api/letters', {
    method: 'POST', token: tokenA, body: { content: '即时信件' }
  });
  assert(instant.status === 200 && instant.data.scheduled === false, '即时投递 200 且非定时');

  const inboxB = await req('/api/inbox', { token: tokenB });
  assert(inboxB.data.received.length === 1, '收件人收到即时信');

  console.log('2) 定时 1 分钟信件：202 + deliverAt，只有寄件人发出的可见');
  const sched = await req('/api/letters', {
    method: 'POST', token: tokenA, body: { content: '定时信件', delayMs: 60000 }
  });
  assert(sched.status === 202, '定时投递返回 202');
  assert(typeof sched.data.deliverAt === 'number', '返回 deliverAt');
  const schedId = sched.data.id;

  const inboxA = await req('/api/inbox', { token: tokenA });
  const sentItem = inboxA.data.sent.find((l) => l.id === schedId);
  assert(!!sentItem && sentItem.status === 'pending', '寄件人发出的有待投信');
  assert(sentItem.deliverAt === sched.data.deliverAt, '列表含 deliverAt');

  const inboxB2 = await req('/api/inbox', { token: tokenB });
  assert(!inboxB2.data.received.some((l) => l.id === schedId), '收件人收到的没有它');
  assert(!inboxB2.data.conversations.some((l) => l.id === schedId), '对话中没有它');

  console.log('3) 状态查询：写信页刷新恢复');
  const st = await req(`/api/letters/${schedId}/status`, { token: tokenA });
  assert(st.status === 200 && st.data.status === 'pending', '寄件人可查状态');
  assert(st.data.deliverAt - Date.now() > 50000, '剩余时间约 1 分钟');
  const stOther = await req(`/api/letters/${schedId}/status`, { token: tokenB });
  assert(stOther.status === 404, '他人查询状态得到 404');

  console.log('4) 待投期间所有接触路径被挡住');
  const thread = await req(`/api/letters/${schedId}/thread`, { token: tokenA });
  assert(thread.status === 409, '寄件人自己也打不开对话');
  const reply = await req(`/api/letters/${schedId}/reply`, {
    method: 'POST', token: tokenB, body: { content: '抢先回复' }
  });
  assert(reply.status === 403, '他人回复被拒');
  const fav = await req(`/api/letters/${schedId}/favorite`, {
    method: 'POST', token: tokenB
  });
  assert(fav.status === 403, '收藏被拒');

  console.log('5) 非法延迟参数被拒');
  const bad = await req('/api/letters', {
    method: 'POST', token: tokenA, body: { content: 'x', delayMs: 123 }
  });
  assert(bad.status === 400, '非法 delayMs 返回 400');

  console.log('6) 取消定时信');
  const cancel = await req(`/api/letters/${schedId}/cancel`, {
    method: 'POST', token: tokenA
  });
  assert(cancel.status === 200, '取消成功');
  const cancelAgain = await req(`/api/letters/${schedId}/cancel`, {
    method: 'POST', token: tokenA
  });
  assert(cancelAgain.status === 409, '重复取消 409');
  const stCancelled = await req(`/api/letters/${schedId}/status`, { token: tokenA });
  assert(stCancelled.data.status === 'cancelled', '状态变为 cancelled');
  const inboxB3 = await req('/api/inbox', { token: tokenB });
  assert(!inboxB3.data.received.some((l) => l.id === schedId), '取消后绝不投递给收件人');
  const cancelledThread = await req(`/api/letters/${schedId}/thread`, { token: tokenA });
  assert(cancelledThread.status === 409, '取消后打不开对话');
  const cancelledFav = await req(`/api/letters/${schedId}/favorite`, {
    method: 'POST', token: tokenA
  });
  assert(cancelledFav.status === 403, '取消后不能收藏');
  const cancelledReply = await req(`/api/letters/${schedId}/reply`, {
    method: 'POST', token: tokenA, body: { content: '补一句' }
  });
  assert(cancelledReply.status === 409, '取消后不能回复');

  console.log('7) 到点自动投递：1.5s 后由调度器随机投给其他旅人');
  const sched2 = await req('/api/letters', {
    method: 'POST', token: tokenA, body: { content: '到点就飞', delayMs: 1500 }
  });
  assert(sched2.status === 202, '短延迟定时信已登记');
  const id2 = sched2.data.id;

  // 到期前仍待投
  await sleep(500);
  const stWaiting = await req(`/api/letters/${id2}/status`, { token: tokenA });
  assert(stWaiting.data.status === 'pending', '到期前保持待投');
  const inboxBWait = await req('/api/inbox', { token: tokenB });
  assert(!inboxBWait.data.received.some((l) => l.id === id2), '到期前收件人接触不到');

  // 等调度器扫描投递
  await waitFor(async () => {
    const s = await req(`/api/letters/${id2}/status`, { token: tokenA });
    return s.data.status === 'delivered' ? s : null;
  }, { label: '定时信到期投递', timeout: 10000 });

  // 随机投给了“其他旅人”（这里只有乙，所以必然是乙）
  const inboxBAfter = await req('/api/inbox', { token: tokenB });
  const got = inboxBAfter.data.received.find((l) => l.id === id2);
  assert(!!got, '收件人的收到的出现该信');
  assert(got.status === 'delivered', '收件侧状态为已送达');

  // 寄件人侧不再是待投
  const sentAfter = (await req('/api/inbox', { token: tokenA })).data.sent
    .find((l) => l.id === id2);
  assert(sentAfter.status === 'delivered', '寄件人侧显示已投递');

  console.log('8) 重复扫描只投一次：再等两个扫描周期，收件数不变');
  const countBefore = (await req('/api/inbox', { token: tokenB })).data.received.length;
  await sleep(1500);
  const countAfter = (await req('/api/inbox', { token: tokenB })).data.received.length;
  assert(countAfter === countBefore, '没有重复投递');

  console.log('9) 取消与到点竞争：先发一封快到期信，立刻取消，二选一且绝不复活');
  const sched3 = await req('/api/letters', {
    method: 'POST', token: tokenA, body: { content: '抢跑', delayMs: 1500 }
  });
  const id3 = sched3.data.id;
  const c = await req(`/api/letters/${id3}/cancel`, { method: 'POST', token: tokenA });
  // 取消在到期前，必然成功
  assert(c.status === 200, '到期前取消成功');
  await sleep(2500);
  const finalSt = await req(`/api/letters/${id3}/status`, { token: tokenA });
  assert(finalSt.data.status === 'cancelled', '过了投递时刻仍是已取消，未复活');
  const inboxBFinal = await req('/api/inbox', { token: tokenB });
  assert(!inboxBFinal.data.received.some((l) => l.id === id3), '取消的信没有投出');

  console.log('10) 原有回复/收藏流程在正常信件上可用');
  const receivedList = (await req('/api/inbox', { token: tokenB })).data.received;
  const received = receivedList[0];
  const favToggle = await req(`/api/letters/${received.id}/favorite`, {
    method: 'POST', token: tokenB
  });
  assert(favToggle.data.favorited === true, '收藏可用');
  const replyOk = await req(`/api/letters/${received.id}/reply`, {
    method: 'POST', token: tokenB, body: { content: '你好呀' }
  });
  assert(replyOk.status === 200, '回复可用');
  const threadOk = await req(`/api/letters/${received.id}/thread`, { token: tokenA });
  assert(threadOk.status === 200 && threadOk.data.messages.length === 2, '寄件人看到回信链');
  const convos = await req('/api/inbox', { token: tokenA });
  assert(convos.data.conversations.length === 1, '对话中出现该链');
}

main()
  .then(async () => {
    await sleep(200);
    server.kill();
    if (failures) {
      console.error(`HTTP 测试失败：${failures} 项`);
      process.exit(1);
    }
    console.log('HTTP 端到端测试全部通过');
  })
  .catch(async (err) => {
    console.error(err);
    server.kill();
    process.exit(1);
  });
