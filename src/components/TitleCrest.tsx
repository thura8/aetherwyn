/* The darker band across the middle of awt-face is a reflected horizon, which makes the letters read as metal rather than a flat gradient. */

export function TitleWordmark() {
  return (
    <svg viewBox="0 0 1000 200" role="img" aria-label="Aetherwyn">
      <defs>
        <text
          id="awt-word"
          x="500"
          y="150"
          textAnchor="middle"
          fontFamily="Cinzel, serif"
          fontWeight="700"
          fontSize="104"
          letterSpacing="9"
        >
          <tspan fontFamily="'Cinzel Decorative', Cinzel, serif" fontWeight="900" fontSize="140">
            A
          </tspan>
          ETHERWY
          <tspan fontFamily="'Cinzel Decorative', Cinzel, serif" fontWeight="900" fontSize="140">
            N
          </tspan>
        </text>
        <linearGradient id="awt-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7dc" />
          <stop offset="0.28" stopColor="#f7d996" />
          <stop offset="0.5" stopColor="#d9a54c" />
          <stop offset="0.53" stopColor="#8f5f1d" />
          <stop offset="0.7" stopColor="#c38d38" />
          <stop offset="0.9" stopColor="#f2cd84" />
          <stop offset="1" stopColor="#fbe3a8" />
        </linearGradient>
        <linearGradient id="awt-sheen-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff8e2" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff8e2" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff8e2" stopOpacity="0" />
        </linearGradient>
        <clipPath id="awt-word-clip">
          <use href="#awt-word" />
        </clipPath>
        <filter id="awt-bevel" x="-5%" y="-25%" width="110%" height="150%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b" />
          <feSpecularLighting
            in="b"
            surfaceScale="3"
            specularConstant="1"
            specularExponent="24"
            lightingColor="#fff4d6"
            result="s"
          >
            <feDistantLight azimuth="235" elevation="50" />
          </feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" result="si" />
          <feComposite in="SourceGraphic" in2="si" operator="arithmetic" k2="1" k3="0.65" />
        </filter>
        <filter id="awt-band-shadow" x="-5%" y="-50%" width="110%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#120a24" floodOpacity="0.9" />
        </filter>
        <filter id="awt-halo" x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <g className="title-band" fill="#f3d38c" filter="url(#awt-band-shadow)">
        <path d="M206 62.2 H496 L500 61 L504 62.2 H782 V63.8 H504 L500 65 L496 63.8 H206 Z" />
        <path d="M232 56.6 H470 V57.4 H232 Z M530 56.6 H760 V57.4 H530 Z" opacity="0.55" />
        <path d="M206 165.2 H782 V166.8 H206 Z" />
        <path d="M232 171.6 H760 V172.4 H232 Z" opacity="0.55" />
        <path
          className="title-star"
          d="M500 49 L503 60 L514 63 L503 66 L500 77 L497 66 L486 63 L497 60 Z"
          fill="#fff3d0"
        />
        <path d="M200 63 l6 -4 l6 4 l-6 4 Z M776 63 l6 -4 l6 4 l-6 4 Z M200 166 l6 -4 l6 4 l-6 4 Z M776 166 l6 -4 l6 4 l-6 4 Z" />
      </g>

      <use href="#awt-word" fill="#0d0720" stroke="#0d0720" strokeWidth="12" strokeLinejoin="round" opacity="0.7" filter="url(#awt-halo)" />
      <use href="#awt-word" fill="#2a1606" stroke="#2a1606" strokeWidth="6" strokeLinejoin="round" transform="translate(0 3)" />
      <use href="#awt-word" fill="none" stroke="#e8c47a" strokeWidth="3" strokeLinejoin="round" />
      <use href="#awt-word" fill="none" stroke="#5a3810" strokeWidth="1.2" strokeLinejoin="round" />
      <use href="#awt-word" fill="url(#awt-face)" filter="url(#awt-bevel)" />

      <g clipPath="url(#awt-word-clip)">
        <rect className="title-sheen" x="-260" y="0" width="200" height="200" fill="url(#awt-sheen-grad)" transform="skewX(-18)" />
      </g>
    </svg>
  );
}

export function TitleOrnament() {
  return (
    <svg className="ornament" viewBox="0 0 640 56" aria-hidden="true">
      <defs>
        <linearGradient id="awt-o-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="0">
          <stop offset="0" stopColor="#fbe2a6" />
          <stop offset="0.65" stopColor="#e2b660" />
          <stop offset="1" stopColor="#b8862f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="awt-o-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2c8" />
          <stop offset="0.5" stopColor="#e9bf6a" />
          <stop offset="1" stopColor="#a87628" />
        </linearGradient>
        <linearGradient id="awt-o-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2fdff" />
          <stop offset="0.45" stopColor="#94e1f3" />
          <stop offset="1" stopColor="#2f7fa6" />
        </linearGradient>
        <radialGradient id="awt-o-glow">
          <stop offset="0" stopColor="#94e1f3" stopOpacity="0.75" />
          <stop offset="1" stopColor="#94e1f3" stopOpacity="0" />
        </radialGradient>
        <g id="awt-o-arm">
          <path d="M30 -1.7 C 120 -1.2, 220 -0.4, 300 0 C 220 0.4, 120 1.2, 30 1.7 Z" fill="url(#awt-o-line)" />
          <path d="M58 -7 H210 M58 7 H210" stroke="url(#awt-o-line)" strokeWidth="0.8" opacity="0.6" />
          <path d="M22 0 C 30 -1, 34 -11, 45 -11 C 55 -11, 57 -2, 50 -2 C 45 -2, 45 -7, 49 -7" fill="none" stroke="url(#awt-o-gold)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M22 0 C 30 1, 34 11, 45 11 C 55 11, 57 2, 50 2 C 45 2, 45 7, 49 7" fill="none" stroke="url(#awt-o-gold)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M96 0 l5 -4.5 l5 4.5 l-5 4.5 Z" fill="#f3d38c" />
          <circle cx="150" cy="0" r="1.6" fill="#f3d38c" />
          <circle cx="232" cy="0" r="1.3" fill="#f3d38c" opacity="0.8" />
        </g>
      </defs>
      <g transform="translate(320 28)">
        <g className="ornament-arms">
          <use href="#awt-o-arm" />
          <use href="#awt-o-arm" transform="scale(-1 1)" />
        </g>
        <g className="ornament-sigil">
          <circle r="26" fill="url(#awt-o-glow)" />
          <path d="M0 -25 L4 -4 L20 0 L4 4 L0 25 L-4 4 L-20 0 L-4 -4 Z" fill="url(#awt-o-gold)" />
          <path d="M0 -13 L9.2 -9.2 L13 0 L9.2 9.2 L0 13 L-9.2 9.2 L-13 0 L-9.2 -9.2 Z" fill="#1d1640" stroke="url(#awt-o-gold)" strokeWidth="1.4" />
          <path d="M0 -8.5 L7 0 L0 8.5 L-7 0 Z" fill="url(#awt-o-gem)" />
          <path d="M0 -8.5 L-7 0 L0 0 Z" fill="#ffffff" opacity="0.45" />
          <path d="M0 -8.5 L7 0 L0 8.5 L-7 0 Z" fill="none" stroke="#e8f9ff" strokeWidth="0.6" opacity="0.8" />
        </g>
      </g>
    </svg>
  );
}
