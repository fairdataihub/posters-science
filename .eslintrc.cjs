module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: [
    "@nuxtjs/eslint-config-typescript",
    "plugin:prettier/recommended",
    "eslint-config-prettier",
  ],
  parser: "vue-eslint-parser",
  parserOptions: {
    parser: "@typescript-eslint/parser",
  },
  plugins: ["unused-imports", "sort-keys-custom-order", "@stylistic/js"],
  root: true,
  rules: {
    "@stylistic/js/comma-dangle": ["error", "always-multiline"],
    "@stylistic/js/padding-line-between-statements": [
      "error",
      {
        blankLine: "always",
        next: "return",
        prev: "*",
      },
      {
        blankLine: "always",
        next: "*",
        prev: ["const", "let", "var"],
      },
      {
        blankLine: "any",
        next: ["const", "let", "var"],
        prev: ["const", "let", "var"],
      },
    ],
    "@typescript-eslint/no-unused-vars": "off",

    endOfLine: "off",

    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",

    "sort-keys-custom-order/object-keys": [
      "error",
      { orderedKeys: ["id", "username", "name", "title", "50"] },
    ],

    "sort-keys-custom-order/type-keys": [
      "error",
      { orderedKeys: ["id", "username", "name", "title", "50"] },
    ],

    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        args: "after-used",
        argsIgnorePattern: "^_",
        vars: "all",
        varsIgnorePattern: "^_",
      },
    ],

    "prettier/prettier": [
      "error",
      {
        endOfLine: "auto",
      },
    ],

    "vue/padding-line-between-tags": [
      "error",
      [{ blankLine: "always", next: "*", prev: "*" }],
    ],
  },
};
