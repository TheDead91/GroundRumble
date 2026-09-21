import { useId } from 'react';

/**
 * Brand logo: a shield marking LLM security with a signal pulse line.
 * Filled with the tool's primary→secondary gradient and the primary glow.
 */
export const GroundRumbleLogo = ({ size = 40 }) => {
  const gradId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', filter: 'drop-shadow(0 0 10px var(--color-primary-glow))' }}
      role="img"
      aria-label="GroundRumble logo"
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="3" x2="41" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(210, 100%, 55%)" />
          <stop offset="1" stopColor="hsl(280, 85%, 65%)" />
        </linearGradient>
      </defs>
      {/* Shield outline */}
      <path
        d="M24 3.5 40 9.2v14.7c0 9.8-6.5 17.2-16 20.3C14.5 41.1 8 33.7 8 23.9V9.2L24 3.5Z"
        fill={`url(#${gradId})`}
      />
      {/* Shield inner highlight */}
      <path
        d="M24 7.2 36.5 11.6v12.4c0 7.6-5 13.6-12.5 16.3C16.5 37.6 11.5 31.6 11.5 24V11.6L24 7.2Z"
        fill="rgba(255,255,255,0.08)"
      />
      {/* Signal pulse line */}
      <path
        d="M12 25.5h6.2l3-6.8 3.6 12 3.2-5.2H36"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* LLM node */}
      <circle cx="37.5" cy="10.5" r="2.2" fill="#fff" />
      <circle cx="37.5" cy="10.5" r="4.6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
    </svg>
  );
};
