import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LABELS, ROUTES, DELIVERY_OPTIONS } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

export default function ComposePage() {
  const [content, setContent] = useState('');
  const [delayMs, setDelayMs] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const navigate = useNavigate();

  const submit = async () => {
    setError('');
    if (!content.trim()) return;
    setSending(true);
    try {
      const result = await LetterApi.send({ content: content.trim(), delayMs });
      setDone(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    const scheduled = done.scheduled;
    return (
      <div className="compose-wrap" style={{ textAlign: 'center' }}>
        <h2 className="compose-title">
          {scheduled ? '信已封存在驿站' : '信已投入驿站'}
        </h2>
        <p className="compose-hint">
          {scheduled
            ? LABELS.SCHEDULED_HINT
            : '它正在寻找一位陌生的旅人……'}
        </p>
        <div className="home-actions">
          {scheduled && (
            <button
              className="big-btn"
              onClick={() => navigate(`/pending/${done.id}`)}
            >
              查看投递状态
            </button>
          )}
          <button className="secondary-btn" onClick={() => { setDone(null); setContent(''); setDelayMs(0); }}>
            再写一封
          </button>
          <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
            去看看我的信箱
          </button>
        </div>
      </div>
    );
  }

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
      <div className="delivery-options">
        <span className="delivery-label">{LABELS.SEND_WHEN}</span>
        {DELIVERY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`delivery-chip ${delayMs === opt.value ? 'active' : ''}`}
            onClick={() => setDelayMs(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="compose-footer">
        <span className="count">{content.length} / 2000</span>
        <div>
          <button
            className="secondary-btn"
            style={{ marginRight: 10 }}
            onClick={() => navigate(ROUTES.HOME)}
          >
            {LABELS.BACK}
          </button>
          <button className="big-btn" onClick={submit} disabled={sending || !content.trim()}>
            {sending ? '投入中…' : LABELS.SEND}
          </button>
        </div>
      </div>
      <div className="error-text">{error}</div>
    </div>
  );
}
