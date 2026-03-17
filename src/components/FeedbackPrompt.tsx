import { useState } from 'react';
import { createPortal } from 'react-dom';
import { sendFeedback } from '../utils/sendFeedback';
import styles from './FeedbackPrompt.module.css';

const EMOJIS: { value: string; label: string }[] = [
  { value: '😔', label: 'Not great' },
  { value: '😐', label: "It's okay" },
  { value: '😊', label: 'Love it' },
];

interface Props {
  context?: string;
}

export default function FeedbackPrompt({ context = 'general' }: Props) {
  const [open,   setOpen]   = useState(false);
  const [emoji,  setEmoji]  = useState<string | null>(null);
  const [text,   setText]   = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleClose = () => {
    setOpen(false);
    setEmoji(null);
    setText('');
    setStatus('idle');
  };

  const handleSend = async () => {
    if (!emoji || status !== 'idle') return;
    setStatus('sending');
    const message = [emoji, text.trim()].filter(Boolean).join('\n\n');
    await sendFeedback(message, context);
    setStatus('sent');
    setTimeout(handleClose, 1800);
  };

  return (
    <>
      {/* Trigger — stays in the panel body */}
      <div className={styles.triggerWrap}>
        <button className={styles.triggerBtn} onClick={() => setOpen(true)}>
          🌙 Tell me what you think
        </button>
      </div>

      {/* Modal — portalled to avoid panel clipping */}
      {open && createPortal(
        <div className={styles.overlay} onClick={handleClose}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            {status === 'sent' ? (
              <p className={styles.thanks}>thank you ✦</p>
            ) : (
              <>
                {/* Header */}
                <div className={styles.header}>
                  <span className={styles.title}>How did the app feel?</span>
                  <button className={styles.closeBtn} onClick={handleClose}>×</button>
                </div>
                {/* Emoji picker */}
                <div className={styles.emojiRow}>
                  {EMOJIS.map(e => (
                    <button
                      key={e.value}
                      className={`${styles.emojiBtn} ${emoji === e.value ? styles.emojiSelected : ''}`}
                      onClick={() => setEmoji(e.value)}
                      title={e.label}
                    >
                      {e.value}
                    </button>
                  ))}
                </div>

                {/* Optional message */}
                <div className={styles.textSection}>
                  <p className={styles.textLabel}>tell us more… (optional)</p>
                  <textarea
                    className={styles.textarea}
                    placeholder="share a thought…"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={3}
                    disabled={status === 'sending'}
                  />
                </div>

                {/* Actions */}
                <div className={styles.actions}>
                  <button className={styles.cancelBtn} onClick={handleClose}>
                    cancel
                  </button>
                  <button
                    className={styles.sendBtn}
                    onClick={handleSend}
                    disabled={!emoji || status === 'sending'}
                  >
                    {status === 'sending' ? 'sending…' : 'send'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>,
        document.body
      )}
    </>
  );
}
