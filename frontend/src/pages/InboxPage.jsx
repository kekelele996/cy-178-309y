import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LABELS, STATUS_TEXT } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';
import { formatDateTime, formatRemain } from '../utils/format.js';

const TABS = [
  { key: 'received', label: LABELS.RECEIVED },
  { key: 'sent', label: LABELS.SENT },
  { key: 'conversations', label: LABELS.CONVERSATIONS }
];

function isScheduled(item) {
  return item.deliverAt != null;
}

function LetterCard({ item, now, onOpen, onToggleFavorite, onSkip, onCancel, cancellingId }) {
  const scheduled = isScheduled(item);
  const waiting = scheduled && item.status === 'pending';
  const cancelledScheduled = scheduled && item.status === 'cancelled';
  const locked = waiting || cancelledScheduled;
  const cancelled = item.status === 'cancelled';
  const remain = waiting ? item.deliverAt - now : 0;

  const badgeClass = cancelled
    ? 'badge skipped'
    : waiting
      ? 'badge waiting'
      : 'badge';

  const cardClick = () => {
    // 未投递（待投/已取消）的定时信件任何人都打不开
    if (locked) return;
    onOpen(item.id);
  };

  return (
    <div
      className={`letter-card ${locked ? 'locked' : ''}`}
      onClick={cardClick}
    >
      <div className="letter-meta">
        <span>
          {item.role === 'sent' ? LABELS.SENT_FROM_ME : LABELS.SENT_FROM_STRANGER}
          {item.replyCount > 0 ? ` · ${item.replyCount} 封回信` : ''}
        </span>
        <span>
          {formatDateTime(item.createdAt)}
          {item.status && item.status !== 'delivered' && (
            <>
              {' '}
              <span className={badgeClass}>{STATUS_TEXT[item.status]}</span>
            </>
          )}
        </span>
      </div>

      {waiting && (
        <div className="schedule-line">
          <span>
            {LABELS.DELIVER_AT} {formatDateTime(item.deliverAt)} · {LABELS.REMAINING}{' '}
            <strong>{formatRemain(remain)}</strong>
          </span>
          {remain <= 0 && <span className="countdown-note">正在寻找旅人……</span>}
          {item.failureReason && (
            <span className="failure-reason">
              {LABELS.DELIVERY_FAILED}：{item.failureReason}（{LABELS.RETRY_HINT}）
            </span>
          )}
        </div>
      )}

      <div className="letter-preview">{item.preview}{item.preview.length >= 80 ? '…' : ''}</div>

      <div className="letter-actions" onClick={(e) => e.stopPropagation()}>
        {!locked && (
          <button
            className={`icon-btn ${item.favorited ? 'on' : ''}`}
            onClick={() => onToggleFavorite(item.id)}
          >
            {item.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
          </button>
        )}
        {waiting && (
          <button
            className="icon-btn danger"
            onClick={() => onCancel(item.id)}
            disabled={cancellingId === item.id}
          >
            {cancellingId === item.id ? '取消中…' : LABELS.CANCEL_DELIVERY}
          </button>
        )}
        {item.role === 'received' && item.status !== 'skipped' && item.replyCount === 0 && (
          <button className="icon-btn" onClick={() => onSkip(item.id)}>
            {LABELS.SKIP}
          </button>
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
  const [now, setNow] = useState(Date.now());
  const [cancellingId, setCancellingId] = useState(null);
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const result = await LetterApi.inbox();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // 剩余时间每秒跳动，刷新页面后从服务端 deliverAt 重新计算
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 有待投信件时周期性拉取，到点/失败/取消后及时更新
  const hasWaiting = data.sent.some(
    (l) => l.deliverAt != null && l.status === 'pending'
  );
  useEffect(() => {
    if (!hasWaiting) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [hasWaiting]);

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
      await refresh();
    } finally {
      setCancellingId(null);
    }
  };

  const list = data[tab] || [];

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
              now={now}
              onOpen={(id) => navigate(`/thread/${id}`)}
              onToggleFavorite={toggleFavorite}
              onSkip={skip}
              onCancel={cancel}
              cancellingId={cancellingId}
            />
          ))}
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
