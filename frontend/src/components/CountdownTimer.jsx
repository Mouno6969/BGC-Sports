// ---------------------------------------------------------------------------
// CountdownTimer — shows countdown to next match
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

// Next match is set to 3 hours and 45 minutes from now (demo)
function getNextMatchTime() {
  const now = new Date();
  // Find next upcoming match time (today at 20:45)
  const next = new Date();
  next.setHours(20, 45, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export default function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [target] = useState(getNextMatchTime);

  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ hours, minutes, seconds });
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [target]);

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <span className="text-amber-400 text-sm">⏱</span>
      <span className="text-[11px] text-amber-300/80 font-medium">Next match in</span>
      <div className="flex items-center gap-1 font-mono font-bold text-amber-400 text-sm">
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5">{pad(timeLeft.hours)}</span>
        <span className="text-amber-500/60">:</span>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5">{pad(timeLeft.minutes)}</span>
        <span className="text-amber-500/60">:</span>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5">{pad(timeLeft.seconds)}</span>
      </div>
    </div>
  );
}
