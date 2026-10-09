/* ------------------------------------------------------------------ */
/* Hero illustration: three static item cards, no carousel (ui-spec 7) */
/* ------------------------------------------------------------------ */
export function HeroArt() {
  return (
    <svg
      viewBox="0 0 320 220"
      role="img"
      aria-label="Minh họa ba món đồ được đăng tin trên ReMarket"
      className="h-auto w-full max-w-[320px]"
    >
      <rect x="8" y="46" width="132" height="150" rx="12" fill="#FFFFFF" stroke="#DDE4DC" />
      <rect x="24" y="62" width="100" height="66" rx="8" fill="#E8F3EC" />
      <path d="M40 106l18-18 14 14 10-10 22 22H40z" fill="#17633F" opacity="0.35" />
      <rect x="24" y="140" width="84" height="10" rx="5" fill="#DDE4DC" />
      <rect x="24" y="158" width="52" height="10" rx="5" fill="#17633F" opacity="0.5" />

      <rect x="96" y="18" width="140" height="156" rx="12" fill="#FFFFFF" stroke="#DDE4DC" />
      <rect x="114" y="36" width="104" height="72" rx="8" fill="#F0F3EE" />
      <circle cx="150" cy="66" r="14" fill="#17633F" opacity="0.3" />
      <path d="M132 96l20-20 16 16 12-12 30 30h-78z" fill="#17633F" opacity="0.35" />
      <rect x="114" y="120" width="90" height="10" rx="5" fill="#DDE4DC" />
      <rect x="114" y="138" width="58" height="10" rx="5" fill="#17633F" opacity="0.5" />

      <rect x="184" y="72" width="124" height="132" rx="12" fill="#FFFFFF" stroke="#DDE4DC" />
      <rect x="200" y="88" width="92" height="60" rx="8" fill="#E8F3EC" />
      <path d="M214 130l16-16 12 12 10-10 26 26h-64z" fill="#17633F" opacity="0.35" />
      <rect x="200" y="160" width="76" height="10" rx="5" fill="#DDE4DC" />
      <rect x="200" y="178" width="46" height="10" rx="5" fill="#17633F" opacity="0.5" />
    </svg>
  );
}
