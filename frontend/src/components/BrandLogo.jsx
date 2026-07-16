export function BrandMark({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8.5 5.5h8M5.5 8.5v8M31.5 5.5h-8M34.5 8.5v8M8.5 34.5h8M5.5 31.5v-8M31.5 34.5h-8M34.5 31.5v-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M13.25 15.2 20 11.3l6.75 3.9v7.8L20 26.9 13.25 23v-7.8Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="m20 11.3 2.4 4.4-2.4 3.7-2.4-3.7 2.4-4.4Z" fill="currentColor" opacity=".92" />
      <path d="m13.25 15.2 4.35.5L20 19.4l-2.05 3.9-4.7-.3v-7.8Zm13.5 0-4.35.5L20 19.4l2.05 3.9 4.7-.3v-7.8Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" opacity=".82" />
      <circle cx="20" cy="20" r="16.5" stroke="currentColor" strokeWidth="1" opacity=".18" />
    </svg>
  );
}

export default function BrandLogo({ compact = false, className = '' }) {
  return (
    <span className={`brand-logo ${compact ? 'brand-logo--compact' : ''} ${className}`.trim()}>
      <span className="brand-logo__mark" aria-hidden="true">
        <BrandMark className="h-full w-full" />
      </span>
      {!compact && (
        <span className="brand-logo__wordmark" aria-hidden="true">
          <span>BGC</span> <strong>SPORTS</strong>
        </span>
      )}
      <span className="sr-only">BGC Sports</span>
    </span>
  );
}
