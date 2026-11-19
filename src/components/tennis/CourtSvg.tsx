/** Static perspective court. No players, no animation. */
export default function CourtSvg() {
  return (
    <svg viewBox="0 0 1000 640" className="court-svg" role="img" aria-label="Tennis court">
      <defs>
        <linearGradient id="tnCourtFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a4258" />
          <stop offset="40%" stopColor="#1c3144" />
          <stop offset="100%" stopColor="#152636" />
        </linearGradient>
        <linearGradient id="tnCourtSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#5ec8ff" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="tnLip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d1822" />
          <stop offset="100%" stopColor="#070c12" />
        </linearGradient>
        <filter id="tnSoft" x="-8%" y="-8%" width="116%" height="130%">
          <feDropShadow dx="0" dy="20" stdDeviation="18" floodColor="#000" floodOpacity="0.62" />
        </filter>
      </defs>
      <ellipse cx="500" cy="590" rx="490" ry="26" fill="rgba(0,0,0,0.5)" />
      <polygon points="18,548 982,548 974,564 26,564" fill="url(#tnLip)" />
      <polygon points="18,548 982,548 732,92 268,92" fill="url(#tnCourtFill)" filter="url(#tnSoft)" />
      <polygon points="18,548 982,548 732,92 268,92" fill="url(#tnCourtSheen)" />
      <path d="M18,548 L982,548 L732,92 L268,92 Z" fill="none" stroke="#e8eef5" strokeWidth="2.9" strokeLinejoin="round" />
      <path d="M49.2,491 L950.8,491" fill="none" stroke="#e8eef5" strokeWidth="2.05" />
      <path d="M236.8,149 L763.2,149" fill="none" stroke="#e8eef5" strokeWidth="2.05" />
      <path d="M257.3,491 L358.2,149" fill="none" stroke="#e8eef5" strokeWidth="2.05" />
      <path d="M742.7,491 L641.8,149" fill="none" stroke="#e8eef5" strokeWidth="2.05" />
      <path d="M307.8,320 L692.2,320" fill="none" stroke="#e8eef5" strokeWidth="1.85" />
      <path d="M143,320 L154.4,320" fill="none" stroke="#e8eef5" strokeWidth="2" />
      <path d="M857,320 L845.6,320" fill="none" stroke="#e8eef5" strokeWidth="2" />
      <path d="M500,456 Q500,254 500,44" fill="none" stroke="#f7f9fc" strokeWidth="5" strokeLinecap="round" />
      <rect x="495.8" y="450" width="8.4" height="102" rx="2" fill="#e8eef4" />
      <rect x="496.9" y="39" width="6.2" height="56" rx="1.6" fill="#e8eef4" />
    </svg>
  );
}
