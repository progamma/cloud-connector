const js = require("@eslint/js");
const globals = require("globals");


// The same rules the connector is linted with, in a file of its own rather than a reference to
// that one: the modules eslint needs are resolved from beside the config that names them, and the
// installer is built by a job that installs nothing under public_html. A reference would lint
// here and fail there.
module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["error", {"args": "none"}],
      "brace-style": "off",
      "arrow-spacing": ["error", {"before": true, "after": true}],
      "func-style": "off",
      "object-curly-newline": "off",
      "object-curly-spacing": ["error", "never"],
      "indent": "off",
      "space-before-blocks": "off",
      "keyword-spacing": "off",
      "space-before-function-paren": "off",
      "arrow-body-style": "off",
      "implicit-arrow-linebreak": "off",
      "function-paren-newline": "off",
      "function-call-argument-newline": "off",
      "newline-before-return": "off",
      "no-var": "off",
      "no-redeclare": "off",
      "no-console": "off",
      "no-async-promise-executor": "off",
      "no-prototype-builtins": "off",
      "no-ex-assign": "off",
      "no-empty": ["error", {"allowEmptyCatch": true}],
      "no-multiple-empty-lines": ["error", {"max": 2}],
      "quotes": ["error", "double", {"avoidEscape": true}],
      "semi": ["error", "always"]
    }
  },
  {
    ignores: ["node_modules/**", "build/out/**", "build/staging/**", "build/vendor/**"]
  }
];
