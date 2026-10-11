import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "dist", "uploads", "**/*.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error", "no-useless-escape": "off",
    },
  },
);
