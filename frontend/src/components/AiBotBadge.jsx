// ---------------------------------------------------------------------------
// AiBotBadge — Small badge shown next to the BGC AI bot's name in chat.
// Indicates the message is from the AI analysis agent.
// ---------------------------------------------------------------------------

export default function AiBotBadge() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/25">
      <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a2 2 0 0 1 2 2v1h1a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a2 2 0 0 1 2-2zm0 1.5a.5.5 0 0 0-.5.5v1h1V3a.5.5 0 0 0-.5-.5zM6 8.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
      </svg>
      AI
    </span>
  );
}
