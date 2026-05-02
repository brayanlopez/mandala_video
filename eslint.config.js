import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    // Archivos de la aplicación — entorno browser
    files: ["js/**/*.js", "config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-console": "off", // Se usa para warnings de debug (renderer, presets)
    },
  },
  {
    // Tests — entorno node con globals de vitest
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
  },
];
