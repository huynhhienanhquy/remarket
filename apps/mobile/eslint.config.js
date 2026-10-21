const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const hooks = require("eslint-plugin-react-hooks");
const globals = require("globals");
module.exports = tseslint.config({ ignores: ["node_modules/**", "dist/**", ".expo/**", "android/**", "ios/**"] },
  js.configs.recommended, ...tseslint.configs.recommended, {
    languageOptions: { globals: { ...globals.es2022, ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": hooks }, rules: hooks.configs.recommended.rules,
  }, { files: ["*.js", "*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } });
