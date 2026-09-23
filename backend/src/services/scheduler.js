const { SCHEDULER_INTERVAL_MS } = require('../config/constants');
const LetterService = require('./letterService');

// 周期性扫描到期的定时信件。真正的并发安全由模型层的条件 UPDATE 保证。
const scheduler = {
  timer: null,

  scanOnce(now) {
    try {
      return LetterService.scanDue(now);
    } catch (err) {
      console.error('[scheduler] scan failed:', err);
      return [];
    }
  },

  start() {
    // 启动立即扫一次，补上服务停机期间到期的信件
    setImmediate(() => this.scanOnce());
    this.timer = setInterval(() => this.scanOnce(), SCHEDULER_INTERVAL_MS);
    this.timer.unref();
    return this.timer;
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
};

module.exports = scheduler;
