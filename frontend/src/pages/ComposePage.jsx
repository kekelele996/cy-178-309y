import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LABELS, ROUTES, SCHEDULE_OPTIONS } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';
import { formatDateTime, formatRemain } from '../utils/format.js';

function WriteView({ onSent, onBack }) {
  const [content, setContent] = useState('');
  const [delayMs, setDelayMs] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!content.trim()) return;
    setSending(true);
    try {
      const result = await LetterApi.send({ content: content.trim(), delayMs });
      onSent(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="compose-wrap">
      <h2 className="compose-title">{LABELS.COMPOSE}</h2>
      <p className="compose-hint">
        这封信会随机分配给另一位注册的旅人。你们彼此看不到真名，只以信会友。
      </p>
      <textarea
        className="compose-text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={LABELS.CONTENT_PLACEHOLDER}
        maxLength={2000}
      />
      <div className="schedule-row">
        <span className="schedule-label">{LABELS.DELIVERY_TIME}</span>
        <div className="schedule-options">
          {SCHEDULE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`schedule-chip ${delayMs === opt.value ? 'active' : ''}`}
              onClick={() => setDelayMs(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="compose-footer">
        <span className="count">{content.length} / 2000</span>
        <div>
          <button
            className="secondary-btn"
            style={{ marginRight: 10 }}
            onClick={onBack}
          >
            {LABELS.BACK}
          </button>
          <button className="big-btn" onClick={submit} disabled={sending || !content.trim()}>
            {sending ? '投入中…' : delayMs ? LABELS.WAITING_SEND : LABELS.SEND}
          </button>
        </div>
      </div>
      <div className="error-text">{error}</div>
    </div>
  );
}

function InstantDoneView({ onAgain, navigate }) {
  return (
    <div className="compose-wrap" style={{ textAlign: 'center' }}>
      <h2 className="compose-title">信已投入驿站</h2>
      <p className="compose-hint">它正在寻找一位陌生的旅人……</p>
      <div className="home-actions">
        <button className="secondary-btn" onClick={onAgain}>再写一封</button>
        <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
          去看看我的信箱
        </button>
      </div>
    </div>
  );
}

function ScheduledView({ letterId, status, now, onCancel, onAgain, cancelling, navigate }) {
  const isPending = status && status.status === 'pending' && status.deliverAt;
  const isDelivered = status && status.status === 'delivered';
  const isCancelled = status && status.status === 'cancelled';
  const remain = status && status.deliverAt ? status.deliverAt - now : 0;

  let title = LABELS.SCHEDULED_TITLE;
  if (isDelivered) title = LABELS.DELIVERY_DONE;
  if (isCancelled) title = LABELS.DELIVERY_CANCELLED;

  return (
    <div className="compose-wrap schedule-status">
      <h2 className="compose-title">{title}</h2>

      {isPending && (
        <>
          <p className="compose-hint">{LABELS.SCHEDULED_HINT}</p>
          <div className="countdown-card">
            <div className="countdown-at">
              {LABELS.DELIVER_AT} <strong>{formatDateTime(status.deliverAt)}</strong>
            </div>
            <div className="countdown-remain">
              {LABELS.REMAINING} <strong>{formatRemain(remain)}</strong>
            </div>
            {remain <= 0 && (
              <div className="countdown-note">驿站正在为它寻找旅人……</div>
            )}
            {status.failureReason && (
              <div className="failure-reason">
                {LABELS.DELIVERY_FAILED}：{status.failureReason}（{LABELS.RETRY_HINT}）
              </div>
            )}
          </div>
          <div className="home-actions">
            <button className="secondary-btn danger" onClick={onCancel} disabled={cancelling}>
              {cancelling ? '取消中…' : LABELS.CANCEL_DELIVERY}
            </button>
            <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
              去看看我的信箱
            </button>
          </div>
        </>
      )}

      {isDelivered && (
        <>
          <p className="compose-hint">可以在“发出的”里等待回信。</p>
          <div className="home-actions">
            <button className="secondary-btn" onClick={() => onAgain()}>
              再写一封
            </button>
            <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
              去看看我的信箱
            </button>
          </div>
        </>
      )}

      {isCancelled && (
        <>
          <p className="compose-hint">这封信不会再被送出。</p>
          <div className="home-actions">
            <button className="secondary-btn" onClick={() => onAgain()}>
              再写一封
            </button>
            <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
              去看看我的信箱
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ComposePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState('write');
  const [letterId, setLetterId] = useState(null);
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const statusRef = useRef(null);
  statusRef.current = status;

  // 恢复：写信页刷新后凭地址栏里的信件 id 拉回状态与剩余时间
  useEffect(() => {
    const id = searchParams.get('letter');
    if (!id) return;
    let alive = true;
    LetterApi.status(id)
      .then((s) => {
        if (!alive) return;
        setLetterId(Number(id));
        setStatus(s);
        if (s.deliverAt) setView('scheduled');
      })
      .catch(() => {
        if (alive) setView('write');
      });
    return () => { alive = false; };
    // 仅在挂载时按地址恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每秒刷新剩余时间
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 待投期间轮询服务端状态：到点投递、失败原因、被取消都能及时反映
  useEffect(() => {
    if (view !== 'scheduled' || !letterId) return;
    const t = setInterval(async () => {
      const s = statusRef.current;
      if (s && s.status !== 'pending') {
        clearInterval(t);
        return;
      }
      try {
        const latest = await LetterApi.status(letterId);
        setStatus(latest);
        if (latest.status !== 'pending') clearInterval(t);
      } catch (_err) {
        // 网络抖动时保留当前倒计时，下轮再试
      }
    }, 5000);
    return () => clearInterval(t);
  }, [view, letterId]);

  const resetToWrite = () => {
    setView('write');
    setLetterId(null);
    setStatus(null);
    setError('');
    setSearchParams({}, { replace: true });
  };

  const handleSent = (result) => {
    if (result.scheduled) {
      setLetterId(result.id);
      setStatus({
        id: result.id,
        status: 'pending',
        deliverAt: result.deliverAt,
        failureReason: null
      });
      setView('scheduled');
      setSearchParams({ letter: String(result.id) }, { replace: true });
    } else {
      setView('instantDone');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(LABELS.CANCEL_CONFIRM)) return;
    setCancelling(true);
    setError('');
    try {
      await LetterApi.cancel(letterId);
      setStatus((s) => ({ ...s, status: 'cancelled' }));
    } catch (err) {
      setError(err.message);
      try {
        setStatus(await LetterApi.status(letterId));
      } catch (_e) { /* ignore */ }
    } finally {
      setCancelling(false);
    }
  };

  if (view === 'instantDone') {
    return <InstantDoneView onAgain={resetToWrite} navigate={navigate} />;
  }
  if (view === 'scheduled' && status) {
    return (
      <>
        <ScheduledView
          letterId={letterId}
          status={status}
          now={now}
          onCancel={handleCancel}
          onAgain={resetToWrite}
          cancelling={cancelling}
          navigate={navigate}
        />
        {error && <div className="error-text" style={{ textAlign: 'center' }}>{error}</div>}
      </>
    );
  }
  return <WriteView onSent={handleSent} onBack={() => navigate(ROUTES.HOME)} />;
}
