import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", "node_modules/", "data/", ".agent/", ".backups/"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["src/**/*.{js,jsx}", "shared/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      // This app uses the classic JSX transform: React must be imported.
      "react/jsx-uses-react": "error",
      "react/react-in-jsx-scope": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-key": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["tests/**/*.{js,mjs}", "scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
