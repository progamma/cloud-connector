const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        Node: "writable"  // Global namespace used in this project
      }
    },
    rules: {
      "no-unused-vars": ["error", {"args": "none"}],
      // Allow flexible brace styles for all files
      "brace-style": "off",
      "arrow-spacing": ["error", {"before": true, "after": true}],
      // Allow different formatting for different function types
      "func-style": "off",
      "object-curly-newline": "off",
      "object-curly-spacing": ["error", "never"],
      // Allow flexible indentation for complex nested structures
      "indent": "off",
      // Disable rules that might interfere with manual formatting
      "space-before-blocks": "off",
      "keyword-spacing": "off",
      "space-before-function-paren": "off",
      // Allow flexible arrow function formatting
      "arrow-body-style": "off",
      "implicit-arrow-linebreak": "off",
      // Disable function brace formatting rules
      "function-paren-newline": "off",
      "function-call-argument-newline": "off",
      "newline-before-return": "off",
      // Additional rules for this project
      "no-var": "off",  // Project uses var for namespace declarations
      "no-redeclare": "off",  // Allow redeclaration
      "no-console": "off",  // Console is used for logging
      "no-async-promise-executor": "off",
      "no-prototype-builtins": "off",
      "no-ex-assign": "off",  // Sometimes used in error handling
      "no-empty": ["error", {"allowEmptyCatch": true}],
      "no-multiple-empty-lines": ["error", {"max": 2}],  // Allow up to 2 empty lines
      "quotes": ["error", "double", {"avoidEscape": true}],
      "semi": ["error", "always"]
    }
  }
];
