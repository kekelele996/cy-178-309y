// 独立场景：全驿站只有一个用户时，到点投递必须失败但保留待投状态和原因，之后可重试
process.env.SQLITE_PATH = 'test-tmp/sole.db';
process.env.JWT_SECRET = 'test-secret';
process.env.DB_PORT = '19997';

const fs = require('fs');
for (const f of ['test-tmp/sole.db', 'test-tmp/sole.db-wal', 'test-tmp/sole.db-shm']) {
  try { fs.unlinkSync(f); } catch (_e) { /* ignore */ }
}

const db = require('../src/data/database');
const UserModel = require('../src/models/userModel');
const LetterService = require('../src/services/letterService');
const { SCHEDULE_DELAYS } = require('../src/config/constants');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

const only = UserModel.create({ penName: 'only-one', passwordHash: 'x', createdAt: Date.now() });
const { letter } = LetterService.sendRandom({
  senderId: only,
  content: '驿站里只有我',
  delayMs: SCHEDULE_DELAYS.MINUTE
});

// 模拟到期（把 deliver_at 调到过去）
db.prepare('UPDATE letters SET deliver_at = ? WHERE id = ?')
  .run(Date.now() - 500, letter.id);

const results = LetterService.scanDue(Date.now());
const mine = results.find((r) => r.id === letter.id);
assert(mine && mine.outcome === 'failed', '没有其他旅人，投递结果为 failed');

const row = db.prepare('SELECT * FROM letters WHERE id = ?').get(letter.id);
assert(row.status === 'pending', '投递失败后仍是 pending 待投');
assert(!!row.failure_reason, 'failure_reason 保留了原因');

// 再次扫描：原因不变、状态不变，依然不会乱投
const second = LetterService.scanDue(Date.now());
const again = second.find((r) => r.id === letter.id);
assert(again.outcome === 'failed', '重试仍然失败');
const row2 = db.prepare('SELECT status, receiver_id FROM letters WHERE id = ?').get(letter.id);
assert(row2.status === 'pending' && row2.receiver_id === null, '没有错误地投出去');

// 新旅人到来，下一轮扫描成功
UserModel.create({ penName: 'latecomer', passwordHash: 'x', createdAt: Date.now() });
const third = LetterService.scanDue(Date.now());
const ok = third.find((r) => r.id === letter.id);
assert(ok && ok.outcome === 'delivered', '有旅人后投递成功');
const row3 = db.prepare('SELECT * FROM letters WHERE id = ?').get(letter.id);
assert(row3.status === 'delivered', '最终状态 delivered');
assert(row3.failure_reason === null, '失败原因被清除');

// 再扫一次不会重复投递
const fourth = LetterService.scanDue(Date.now());
assert(!fourth.some((r) => r.id === letter.id), '重复扫描只投一次');

if (failures) { console.error(`失败 ${failures} 项`); process.exit(1); }
console.log('失败保留/重试测试全部通过');
