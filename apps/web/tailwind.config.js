/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F5F7FA",
        surface: "#FFFFFF",
        "surface-subtle": "#EFF3F6",
        ink: "#18313B",
        muted: "#5D6C7A",
        brand: {
          DEFAULT: "#0F766E",
          hover: "#115E59",
          soft: "#E8F6F3",
        },
        line: "#E1E8EE",
        "input-line": "#8797A5",
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
        subtle: "0 2px 8px rgba(24, 49, 59, 0.03)",
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
