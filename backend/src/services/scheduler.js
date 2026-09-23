const { DELIVERY } = require('../config/constants');
const LetterService = require('./letterService');

// Periodically scans for scheduled letters whose deliver_at has passed and
// attempts delivery. The claim inside the service is an atomic conditional
// UPDATE, so overlapping scans can never deliver a letter twice.
let timer = null;
let scanning = false;

async function runScan() {
  if (scanning) return;
  scanning = true;
  try {
    const results = LetterService.scanDueLetters();
    for (const r of results) {
      if (r.outcome === 'delivered') {
        console.log(`[scheduler] letter ${r.id} delivered`);
      } else if (r.outcome === 'failed') {
        console.log(`[scheduler] letter ${r.id} delivery pending: ${r.reason}`);
      }
    }
  } catch (err) {
    console.error('[scheduler] scan failed:', err);
  } finally {
    scanning = false;
  }
}

function startScheduler() {
  if (timer) return;
  runScan();
  timer = setInterval(runScan, DELIVERY.SCAN_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

module.exports = { startScheduler, runScan };
