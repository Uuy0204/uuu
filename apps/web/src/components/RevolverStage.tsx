type RevolverPhase = 'spinning' | 'hit' | 'empty' | null;

export function RevolverStage({ shots, phase }: { shots: number; phase: RevolverPhase }) {
  return <div className={`revolver-stage revolver-${phase ?? 'idle'}`} aria-label={`六格金属左轮弹巢，已扣动 ${shots} 次`} role="img">
    <svg viewBox="0 0 360 360" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="rv-housing" cx="35%" cy="23%" r="82%"><stop stopColor="#e2e2d8" /><stop offset=".14" stopColor="#9ca8a6" /><stop offset=".37" stopColor="#455454" /><stop offset=".62" stopColor="#111d20" /><stop offset=".83" stopColor="#697575" /><stop offset="1" stopColor="#080e11" /></radialGradient>
        <radialGradient id="rv-face" cx="32%" cy="19%" r="83%"><stop stopColor="#aebbb8" /><stop offset=".25" stopColor="#778985" /><stop offset=".5" stopColor="#283638" /><stop offset=".79" stopColor="#151f22" /><stop offset="1" stopColor="#4d5956" /></radialGradient>
        <radialGradient id="rv-bore" cx="39%" cy="31%" r="76%"><stop stopColor="#19262a" /><stop offset=".35" stopColor="#060e11" /><stop offset=".8" stopColor="#010506" /><stop offset="1" stopColor="#384744" /></radialGradient>
        <linearGradient id="rv-rim" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#f1ede0" /><stop offset=".13" stopColor="#87928c" /><stop offset=".32" stopColor="#1a2628" /><stop offset=".56" stopColor="#a6aba1" /><stop offset=".72" stopColor="#202d30" /><stop offset="1" stopColor="#c4beb0" /></linearGradient>
        <radialGradient id="rv-fire"><stop stopColor="#fffce5" /><stop offset=".16" stopColor="#ffe9a3" /><stop offset=".47" stopColor="#f78836" stopOpacity=".9" /><stop offset="1" stopColor="#e84c27" stopOpacity="0" /></radialGradient>
        <pattern id="rv-machining" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M0 1 H6 M0 4 H6" stroke="#f0f1dc" strokeWidth=".32" opacity=".18" /></pattern>
        <filter id="rv-depth" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="13" stdDeviation="11" floodColor="#050809" floodOpacity=".85" /></filter>
        <filter id="rv-glow"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <ellipse cx="180" cy="325" rx="122" ry="16" fill="#050809" opacity=".46" />
      <g className="revolver-body" filter="url(#rv-depth)">
        <circle cx="180" cy="176" r="145" fill="#11191b" stroke="#989c91" strokeWidth="2" />
        <circle cx="180" cy="176" r="138" fill="url(#rv-housing)" stroke="#1a2527" strokeWidth="7" />
        <circle cx="180" cy="176" r="132" fill="none" stroke="#d2d3c5" strokeWidth="2" opacity=".67" />
        <circle cx="180" cy="176" r="125" fill="none" stroke="#0d191b" strokeWidth="8" />
        {Array.from({ length: 48 }, (_, index) => <path key={index} transform={`rotate(${index * 7.5} 180 176)`} d="M180 44 V52" stroke={index % 4 === 0 ? '#c5c6b8' : '#697572'} strokeWidth={index % 4 === 0 ? 2 : 1} opacity=".78" />)}
        <circle cx="180" cy="176" r="117" fill="#081114" stroke="url(#rv-rim)" strokeWidth="9" />
        <g className="revolver-drum">
          <circle cx="180" cy="176" r="109" fill="url(#rv-face)" stroke="#101a1d" strokeWidth="4" />
          <circle cx="180" cy="176" r="106" fill="url(#rv-machining)" opacity=".8" />
          <circle cx="180" cy="176" r="94" fill="none" stroke="#d7d8c6" strokeWidth="1" opacity=".52" />
          <circle cx="180" cy="176" r="88" fill="none" stroke="#101c1e" strokeWidth="2" opacity=".8" />
          {Array.from({ length: 6 }, (_, index) => {
            const angle = index * Math.PI / 3 - Math.PI / 2;
            const cx = 180 + Math.cos(angle) * 68;
            const cy = 176 + Math.sin(angle) * 68;
            return <g key={index}>
              <circle cx={cx} cy={cy} r="31" fill="#0b1518" stroke="url(#rv-rim)" strokeWidth="5" />
              <circle cx={cx} cy={cy} r="25" fill="url(#rv-bore)" stroke="#111b1e" strokeWidth="4" />
              <path d={`M${cx - 15} ${cy - 12} Q${cx} ${cy - 22} ${cx + 12} ${cy - 13}`} fill="none" stroke="#9caeaa" strokeWidth="1.5" opacity=".38" />
              <circle cx={cx} cy={cy} r="18" fill="none" stroke="#60706d" strokeWidth=".8" opacity=".38" />
            </g>;
          })}
          <circle cx="180" cy="176" r="23" fill="#111b1e" stroke="url(#rv-rim)" strokeWidth="6" />
          <circle cx="180" cy="176" r="15" fill="url(#rv-housing)" stroke="#111b1e" strokeWidth="3" />
          <path d="M169 176 H191 M180 165 V187" stroke="#d7d7c6" strokeWidth="2" opacity=".56" />
          <circle cx="180" cy="176" r="4" fill="#1d2b2d" stroke="#e5e3d2" strokeWidth="1" />
        </g>
        <path d="M77 100 A133 133 0 0 1 267 75" fill="none" stroke="#f6f0d8" strokeWidth="3" opacity=".42" strokeLinecap="round" />
        <path d="M80 247 A133 133 0 0 0 273 277" fill="none" stroke="#111c1f" strokeWidth="6" opacity=".76" strokeLinecap="round" />
        <path className="revolver-index" d="M180 26 L171 42 H189 Z" fill="#d7c395" stroke="#312d27" strokeWidth="2" />
        <circle cx="180" cy="176" r="139" fill="url(#rv-machining)" opacity=".13" />
      </g>
      <circle className="revolver-flash" cx="180" cy="176" r="92" fill="url(#rv-fire)" />
      <circle className="revolver-shockwave" cx="180" cy="176" r="110" fill="none" stroke="#ffdfaa" strokeWidth="8" />
      <circle className="revolver-shockwave secondary" cx="180" cy="176" r="80" fill="none" stroke="#f6a252" strokeWidth="3" />
      <path className="revolver-smoke" d="M98 220 C66 197 79 174 62 148 M260 211 C299 187 279 155 300 124" fill="none" stroke="#e9e4cc" strokeWidth="9" strokeLinecap="round" filter="url(#rv-glow)" />
    </svg>
    <div className="revolver-result" aria-hidden="true">{phase === 'hit' ? '砰！' : phase === 'empty' ? '咔哒' : ''}</div>
  </div>;
}
