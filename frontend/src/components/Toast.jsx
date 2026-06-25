// ---------------------------------------------------------------------------
// Toast — a simple notification component that auto-dismisses.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

let toastId = 0;
const listeners = new Set();

/** Show a toast notification. Call from anywhere. */
export function showToast(message, type = 'success') {
  const id = ++toastId;
  listeners.forEach((fn) => fn({ id, message, type }));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3200);
    };
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast rounded-xl border px-5 py-3 text-sm font-medium shadow-lg backdrop-blur ${
            t.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-200'
              : t.type === 'warning'
              ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
              : 'border-accent/30 bg-accent/10 text-accent-light'
          }`}
        >
          <div className="flex items-center gap-2">
            {t.type === 'success' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{t.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
