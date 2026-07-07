// Toast.jsx: the studio's quiet voice. A small stack of transient notices
// with an optional Undo, because a client's real files deserve a way back.
// One host per app; anything can call toast() without wiring props through.
import { useEffect, useState } from "react";

const bus = { push: null };

export function toast(message, opts = {}) {
  if (bus.push) bus.push({ id: `${Date.now()}-${Math.random()}`, message, ...opts });
}

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    bus.push = (t) => {
      setItems((l) => [...l.slice(-2), t]);
      const ttl = t.ttl || 5200;
      t.timer = setTimeout(() => setItems((l) => l.filter((x) => x.id !== t.id)), ttl);
    };
    return () => { bus.push = null; };
  }, []);

  const dismiss = (t) => {
    clearTimeout(t.timer);
    setItems((l) => l.filter((x) => x.id !== t.id));
  };

  if (!items.length) return null;
  return (
    <div className="bktoasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="bktoast" role="status">
          <span className="msg">{t.message}</span>
          {t.onUndo && (
            <button className="undo" onClick={() => { t.onUndo(); dismiss(t); }}>Undo</button>
          )}
          <button className="x" aria-label="Dismiss notice" onClick={() => dismiss(t)}>✕</button>
        </div>
      ))}
    </div>
  );
}
