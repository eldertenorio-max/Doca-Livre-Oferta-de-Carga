type Props = {
  size?: number
  className?: string
}

/** Atendente com headset — ícone de ajuda e suporte. */
export function SuporteIcon({ size = 32, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#ea580c" />
      <path
        fill="#1e3a5f"
        d="M9.5 44.5c1.8-9.4 7.6-14.2 14.5-14.2S36.7 35.1 38.5 44.5H9.5Z"
      />
      <path fill="#fff" d="M20.2 31.2 24 35.4l3.8-4.2v3.2H20.2z" />
      <circle cx="24" cy="18.2" r="8.4" fill="#f8fafc" />
      <path
        fill="#7c4a2d"
        d="M16.2 17.4c.4-5.2 3.6-8.6 7.8-8.6 4.1 0 7.3 3.2 7.8 8.2-.9-2.6-3.6-4.4-7.6-4.4-4.2 0-7.2 1.9-8 4.8Z"
      />
      <path
        fill="none"
        stroke="#0f172a"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M15.6 18.6c.2-5.4 3.8-9.2 8.4-9.2s8.2 3.8 8.4 9.2"
      />
      <rect x="13.4" y="16.6" width="4.2" height="6.2" rx="2.1" fill="#0f172a" />
      <rect x="30.4" y="16.6" width="4.2" height="6.2" rx="2.1" fill="#0f172a" />
      <path
        fill="none"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinecap="round"
        d="M34.6 22.4c2.4 1.4 3.6 4.2 3.2 7.2"
      />
      <circle cx="37.4" cy="30.6" r="1.7" fill="#0f172a" />
      <circle cx="21.4" cy="18.6" r="1.05" fill="#0f172a" />
      <circle cx="26.6" cy="18.6" r="1.05" fill="#0f172a" />
      <path
        fill="none"
        stroke="#0f172a"
        strokeWidth="1.3"
        strokeLinecap="round"
        d="M21.8 22.2c.8.8 1.8 1.2 2.4 1.2s1.6-.4 2.4-1.2"
      />
    </svg>
  )
}
