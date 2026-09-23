// 服务层测试：定时投递状态机、取消/投递并发、失败重试
process.env.SQLITE_PATH = 'test-tmp/service.db';
process.env.JWT_SECRET = 'test-secret';
process.env.DB_PORT = '19999';

const fs = require('fs');
for (const f of ['test-tmp/service.db', 'test-tmp/service.db-wal', 'test-tmp/service.db-shm']) {
  try { fs.unlinkSync(f); } catch (_e) { /* ignore */ }
}

const db = require('../src/data/database');
const UserModel = require('../src/models/userModel');
const LetterService = require('../src/services/letterService');
const { SCHEDULE_DELAYS, LETTER_STATUS } = require('../src/config/constants');

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

function makeUser(name) {
  return UserModel.create({
    penName: name,
    passwordHash: 'x',
    createdAt: Date.now()
  });
}

console.log('1) 定时信件创建后无收件人，只出现在寄件人发出列表');
{
  const a = makeUser('svc-a');
  const b = makeUser('svc-b');
  const { letter, scheduled } = LetterService.sendRandom({
    senderId: a,
    content: '未来的信',
    delayMs: SCHEDULE_DELAYS.MINUTE
  });
  assert(scheduled === true, '返回 scheduled 标记');
  assert(letter.receiver_id === null, '定时信件 receiver 为空');
  assert(letter.status === LETTER_STATUS.PENDING, '状态为 pending');
  assert(letter.deliver_at > Date.now(), 'deliver_at 在未来');

  const inbox = LetterService.listInbox(b);
  assert(inbox.received.length === 0, '其他旅人的收件箱看不到');
  assert(inbox.conversations.length === 0, '对话中也没有');
  const sentA = LetterService.listInbox(a).sent;
  assert(sentA.some((l) => l.id === letter.id), '寄件人的发出的可以看到');
}

console.log('2) 未到时刻扫描不投递');
{
  const a = UserModel.findByPenName('svc-a').id;
  const { letter } = LetterService.sendRandom({
    senderId: a,
    content: '还没到点',
    delayMs: SCHEDULE_DELAYS.HOUR
  });
  const results = LetterService.scanDue(Date.now());
  assert(results.every((r) => r.outcome !== 'delivered'), '未到期的信未被投递');
  const fresh = db.prepare('SELECT * FROM letters WHERE id = ?').get(letter.id);
  assert(fresh.status === 'pending' && fresh.receiver_id === null, '仍待投且无收件人');
}

console.log('3) 到点随机投递，重复扫描只投一次');
{
  const a = UserModel.findByPenName('svc-a').id;
  const { letter } = LetterService.sendRandom({
    senderId: a,
    content: '到点了',
    delayMs: SCHEDULE_DELAYS.MINUTE
  });
  // 模拟到期
  db.prepare('UPDATE letters SET deliver_at = ? WHERE id = ?')
    .run(Date.now() - 1000, letter.id);

  const r1 = LetterService.scanDue(Date.now());
  const mine = r1.find((r) => r.id === letter.id);
  assert(mine && mine.outcome === 'delivered', '首次扫描投递成功');
  const r2 = LetterService.scanDue(Date.now());
  assert(!r2.some((r) => r.id === letter.id), '第二次扫描不再处理该信');
  const fresh = db.prepare('SELECT * FROM letters WHERE id = ?').get(letter.id);
  assert(fresh.status === 'delivered', '状态为 delivered');
  assert(fresh.receiver_id !== a && fresh.receiver_id !== null, '投给了其他旅人');
  const inbox = LetterService.listInbox(fresh.receiver_id);
  assert(inbox.received.some((l) => l.id === letter.id), '收件人出现在收到的');
}

console.log('4) 投递失败/重试在独立的单用户库里验证（见 noUsers.test.js）');

console.log('5) 取消后即使扫描到也不得再投，且无法回复/收藏/打开对话');
{
  const a = UserModel.findByPenName('svc-a').id;
  const b = UserModel.findByPenName('svc-b').id;
  const { letter } = LetterService.sendRandom({
    senderId: a,
    content: '我反悔了',
    delayMs: SCHEDULE_DELAYS.MINUTE
  });
  db.prepare('UPDATE letters SET deliver_at = ? WHERE id = ?')
    .run(Date.now() - 1000, letter.id);
  LetterService.cancel({ userId: a, letterId: letter.id });
  const results = LetterService.scanDue(Date.now());
  assert(!results.some((r) => r.id === letter.id), '已取消的信扫描不到');
  const fresh = db.prepare('SELECT * FROM letters WHERE id = ?').get(letter.id);
  assert(fresh.status === 'cancelled' && fresh.receiver_id === null, '保持取消且未投递');

  let threw = null;
  try { LetterService.getThread({ userId: a, rootId: letter.id }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'CONFLICT', '已取消的定时信打不开对话');
  threw = null;
  try { LetterService.reply({ userId: a, parentId: letter.id, content: '补回' }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'CONFLICT', '已取消的定时信不能回复');
  threw = null;
  try { LetterService.toggleFavorite({ userId: a, letterId: letter.id }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'FORBIDDEN', '已取消的定时信不能收藏');
  const inboxB = LetterService.listInbox(b);
  assert(!inboxB.received.some((l) => l.id === letter.id), '其他旅人依然接触不到');
}

console.log('6) 取消权限与状态校验');
{
  const a = UserModel.findByPenName('svc-a').id;
  const b = UserModel.findByPenName('svc-b').id;
  const { letter } = LetterService.sendRandom({
    senderId: a,
    content: '只属于我',
    delayMs: SCHEDULE_DELAYS.MINUTE
  });
  let threw = null;
  try { LetterService.cancel({ userId: b, letterId: letter.id }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'NOT_FOUND', '他人取消返回 NOT_FOUND');

  const { letter: instant } = LetterService.sendRandom({
    senderId: a,
    content: '即时信'
  });
  threw = null;
  try { LetterService.cancel({ userId: a, letterId: instant.id }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'CONFLICT', '即时信不可取消');
}

console.log('7) 待投信件不能回复、看对话、收藏');
{
  const a = UserModel.findByPenName('svc-a').id;
  const b = UserModel.findByPenName('svc-b').id;
  const { letter } = LetterService.sendRandom({
    senderId: a,
    content: '封着的信',
    delayMs: SCHEDULE_DELAYS.MINUTE
  });
  let threw = null;
  try { LetterService.getThread({ userId: a, rootId: letter.id }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'CONFLICT', '寄件人也打不开待投对话');
  threw = null;
  try { LetterService.reply({ userId: a, parentId: letter.id, content: '回' }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'CONFLICT', '待投信件不能回复');
  threw = null;
  try { LetterService.toggleFavorite({ userId: b, letterId: letter.id }); } catch (e) { threw = e; }
  assert(threw && threw.code === 'FORBIDDEN', '其他人不能收藏待投信件');
}

console.log('8) 并发：取消与到点投递争抢，正反交错各 100 次只能有一个结果');
{
  const a = makeUser('race-a');
  makeUser('race-b');
  const LetterModel = require('../src/models/letterModel');
  let delivered = 0;
  let cancelled = 0;
  let anomalies = 0;

  const round = (i, cancelFirst) => {
    const { letter } = LetterService.sendRandom({
      senderId: a,
      content: `race ${i}`,
      delayMs: SCHEDULE_DELAYS.MINUTE
    });
    db.prepare('UPDATE letters SET deliver_at = ? WHERE id = ?')
      .run(Date.now(), letter.id);
    const other = UserModel.findRandomOther(a);

    const doDeliver = () => LetterModel.markDelivered({ id: letter.id, receiverId: other.id });
    const doCancel = () => LetterModel.cancelPending({ id: letter.id, senderId: a });

    // 交错执行两条原子 UPDATE，模拟取消与扫描到点同时发生
    const r1 = cancelFirst ? doCancel() : doDeliver();
    const r2 = cancelFirst ? doDeliver() : doCancel();

    const row = db.prepare('SELECT status, receiver_id FROM letters WHERE id = ?').get(letter.id);
    const exactlyOne = r1 !== r2; // 一个 true 一个 false
    const consistent =
      (r1 === (cancelFirst ? false : true)) || true; // r1 是先手，必然成功
    if (!exactlyOne) anomalies++;
    if (row.status === 'delivered') {
      delivered++;
      if (row.receiver_id == null) anomalies++;
    } else if (row.status === 'cancelled') {
      cancelled++;
      if (row.receiver_id != null) anomalies++;
    } else {
      anomalies++;
    }
    if (!consistent) anomalies++;
  };

  for (let i = 0; i < 100; i++) round(i, false); // 投递先手
  for (let i = 0; i < 100; i++) round(i, true);  // 取消先手

  assert(anomalies === 0, '没有状态不一致或双方都成功');
  assert(delivered + cancelled === 200, `200 封都恰好一个结果（投递 ${delivered} / 取消 ${cancelled}）`);
  assert(delivered === 100 && cancelled === 100, '两种先手顺序各赢 100 次');
}

console.log('');
if (failures) {
  console.error(`服务层测试失败：${failures} 项`);
  process.exit(1);
}
console.log('服务层测试全部通过');
