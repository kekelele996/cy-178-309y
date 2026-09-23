import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LABELS, ROUTES, STATUS_TEXT, formatRemaining } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

// Status page for a (possibly scheduled) letter. Survives refresh: all state
// comes from the server, and the countdown is derived from server timestamps.
export default function PendingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [letter, setLetter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await LetterApi.get(id);
      // Correct local clock drift: remaining = deliverAt - serverTime,
      // then tick locally using Date.now().
      offsetRef.current = Date.now() - data.serverTime;
      setLetter(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const scheduled = letter && letter.status === 'scheduled';

  // Tick the countdown every second; refetch from the server around the
  // delivery moment so a delivered/cancelled/failed state shows promptly.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = scheduled
      ? setInterval(load, 5000)
      : null;
    return () => {
      clearInterval(tick);
      if (poll) clearInterval(poll);
    };
  }, [scheduled, load]);

  const cancel = async () => {
    if (!window.confirm(LABELS.CANCEL_CONFIRM)) return;
    setCancelling(true);
    setError('');
    try {
      await LetterApi.cancel(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="loading">加载中…</div>;
  if (!letter) {
    return (
      <div className="compose-wrap" style={{ textAlign: 'center' }}>
        <p className="empty-state">{error || '无法加载这封信'}</p>
        <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
          {LABELS.BACK}
        </button>
      </div>
    );
  }

  const serverNow = now - offsetRef.current;
  const remaining = letter.deliverAt ? letter.deliverAt - serverNow : 0;

  let hint = '';
  if (letter.status === 'scheduled') hint = LABELS.SCHEDULED_HINT;
  else if (letter.status === 'cancelled') hint = LABELS.CANCELLED_HINT;
  else if (letter.status === 'delivering') hint = LABELS.IN_DELIVERY + '…';
  else if (letter.status === 'delivered' || letter.status === 'replied') hint = LABELS.DELIVERED_HINT;

  return (
    <div className="compose-wrap pending-wrap">
      <h2 className="compose-title">信件 #{letter.id}</h2>

      <div className="pending-status-row">
        <span className={`badge ${letter.status === 'cancelled' ? 'skipped' : ''}`}>
          {STATUS_TEXT[letter.status] || letter.status}
        </span>
        {scheduled && (
          <span className="pending-countdown">
            {LABELS.REMAINING} {formatRemaining(remaining)}
          </span>
        )}
      </div>

      <p className="compose-hint">{hint}</p>

      {scheduled && letter.failReason && (
        <p className="pending-fail">
          {LABELS.DELIVERY_FAIL_HINT}（{letter.failReason}）
        </p>
      )}

      <div className="letter-preview pending-content">{letter.content}</div>

      <div className="home-actions">
        {scheduled && (
          <button className="big-btn" onClick={cancel} disabled={cancelling}>
            {cancelling ? LABELS.CANCELLING : LABELS.CANCEL_DELIVERY}
          </button>
        )}
        <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
          去看看我的信箱
        </button>
      </div>
      <div className="error-text">{error}</div>
    </div>
  );
}
