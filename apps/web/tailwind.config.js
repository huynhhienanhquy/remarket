import tokens from "../../packages/shared/ui-tokens.json";

const { color, radius, layout } = tokens;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: color.page,
        surface: color.surface,
        "surface-subtle": color.subtle,
        ink: color.ink,
        muted: color.muted,
        brand: { DEFAULT: color.brand, hover: color.brandHover, soft: color.brandSoft },
        line: color.line,
        "input-line": color.inputLine,
        accent: color.accent,
        "warning-bg": color.warningBg,
        danger: { DEFAULT: color.danger, bg: color.dangerBg },
        info: { DEFAULT: color.info, bg: color.infoBg },
        focus: color.info,
      },
      spacing: {
        "mobile-header": layout.header + "px",
        "mobile-nav": layout.tabBar + "px",
        touch: layout.touchTarget + "px",
      },
      maxWidth: { marketplace: layout.maxWidth + "px" },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        control: radius.control + "px",
        card: radius.card + "px",
        modal: radius.modal + "px",
      },
      zIndex: {
        section: "10",
        header: "20",
        "action-bar": "30",
        overlay: "40",
        dialog: "50",
        toast: "60",
      },
      boxShadow: {
        pop: "0 4px 16px rgba(23, 37, 29, 0.08)",
        "card-hover": "0 4px 12px rgba(23, 37, 29, 0.08)",
        subtle: "0 2px 8px rgba(23, 37, 29, 0.04)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-up": "slide-up 150ms ease-out",
      },
    },
  },
  plugins: [],
};
