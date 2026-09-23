import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LABELS, STATUS_TEXT, formatRemaining } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

const TABS = [
  { key: 'received', label: LABELS.RECEIVED },
  { key: 'sent', label: LABELS.SENT },
  { key: 'conversations', label: LABELS.CONVERSATIONS }
];

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isScheduled(item) {
  return item.status === 'scheduled' || item.status === 'delivering';
}

function LetterCard({ item, serverNow, onOpen, onToggleFavorite, onSkip, onCancel, cancelling }) {
  const locked = isScheduled(item);
  const cancelled = item.status === 'cancelled';
  const remaining = item.deliverAt ? item.deliverAt - serverNow : 0;

  const badgeClass =
    item.status === 'skipped' || cancelled ? 'badge skipped'
    : locked ? 'badge scheduled'
    : 'badge';

  return (
    <div
      className={`letter-card ${locked || cancelled ? 'locked' : ''}`}
      onClick={() => {
        // Before delivery the letter lives only in the sender's "sent" list;
        // it has no thread and the receiver must not reach it.
        if (!locked && !cancelled) onOpen(item.id);
      }}
    >
      <div className="letter-meta">
        <span>
          {item.role === 'sent' ? LABELS.SENT_FROM_ME : LABELS.SENT_FROM_STRANGER}
          {item.replyCount > 0 ? ` · ${item.replyCount} 封回信` : ''}
        </span>
        <span>
          {formatTime(item.createdAt)}
          {item.status && item.status !== 'delivered' && (
            <>
              {' '}
              <span className={badgeClass}>{STATUS_TEXT[item.status] || item.status}</span>
            </>
          )}
        </span>
      </div>

      {locked && (
        <div className="letter-schedule">
          <span className="pending-countdown">
            {item.status === 'delivering'
              ? LABELS.IN_DELIVERY + '…'
              : `${LABELS.REMAINING} ${formatRemaining(remaining)}`}
          </span>
          {item.failReason && (
            <span className="pending-fail">
              {LABELS.DELIVERY_FAIL_HINT}（{item.failReason}）
            </span>
          )}
        </div>
      )}

      <div className="letter-preview">{item.preview}{item.preview.length >= 80 ? '…' : ''}</div>
      <div className="letter-actions" onClick={(e) => e.stopPropagation()}>
        {!locked && !cancelled && (
          <button
            className={`icon-btn ${item.favorited ? 'on' : ''}`}
            onClick={() => onToggleFavorite(item.id)}
          >
            {item.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
          </button>
        )}
        {item.role === 'received' && item.status !== 'skipped' && item.replyCount === 0 && (
          <button className="icon-btn" onClick={() => onSkip(item.id)}>
            {LABELS.SKIP}
          </button>
        )}
        {item.role === 'sent' && item.status === 'scheduled' && (
          <>
            <button className="icon-btn" onClick={() => onOpen(item.id, true)}>
              投递详情
            </button>
            <button className="icon-btn danger" onClick={() => onCancel(item.id)} disabled={cancelling}>
              {cancelling ? LABELS.CANCELLING : LABELS.CANCEL_DELIVERY}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [tab, setTab] = useState('received');
  const [data, setData] = useState({ sent: [], received: [], conversations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const result = await LetterApi.inbox();
      const anyScheduled =
        (result.sent || []).some((l) => l.status === 'scheduled' || l.status === 'delivering');
      const stamped = result.sent && result.sent[0] ? result.sent[0].serverTime : Date.now();
      offsetRef.current = Date.now() - stamped;
      setData(result);
      return anyScheduled;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Fast polling while any letter is still waiting to go out.
  useEffect(() => {
    const anyScheduled =
      data.sent.some((l) => l.status === 'scheduled' || l.status === 'delivering');
    if (!anyScheduled) return undefined;
    const poll = setInterval(refresh, 5000);
    return () => clearInterval(poll);
  }, [data.sent]);

  const toggleFavorite = async (id) => {
    try {
      await LetterApi.toggleFavorite(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const skip = async (id) => {
    try {
      await LetterApi.skip(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm(LABELS.CANCEL_CONFIRM)) return;
    setCancellingId(id);
    setError('');
    try {
      await LetterApi.cancel(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const list = data[tab] || [];
  const serverNow = now - offsetRef.current;

  const emptyText = useMemo(() => {
    if (tab === 'sent') return LABELS.EMPTY_SENT;
    if (tab === 'received') return LABELS.EMPTY_RECEIVED;
    return LABELS.EMPTY_CONVERSATIONS;
  }, [tab]);

  return (
    <div>
      <div className="inbox-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading">加载中…</div>
      ) : list.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <div className="letter-list">
          {list.map((item) => (
            <LetterCard
              key={item.id}
              item={item}
              serverNow={serverNow}
              onOpen={(id, detail) =>
                navigate(detail ? `/pending/${id}` : `/thread/${id}`)
              }
              onToggleFavorite={toggleFavorite}
              onSkip={skip}
              onCancel={cancel}
              cancelling={cancellingId === item.id}
            />
          ))}
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
