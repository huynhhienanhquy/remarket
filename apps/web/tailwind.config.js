/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F7F8F5",
        surface: "#FFFFFF",
        "surface-subtle": "#F0F3EE",
        ink: "#17251D",
        muted: "#56645B",
        brand: {
          DEFAULT: "#17633F",
          hover: "#104C30",
          soft: "#E8F3EC",
        },
        line: "#DDE4DC",
        "input-line": "#829087",
        accent: "#B45309",
        "warning-bg": "#FFF4DA",
        danger: {
          DEFAULT: "#B42318",
          bg: "#FEF0EE",
        },
        info: {
          DEFAULT: "#245EA8",
          bg: "#ECF3FF",
        },
        focus: "#245EA8",
      },
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
        control: "8px",
        card: "12px",
        modal: "16px",
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
