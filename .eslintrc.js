module.exports = {
  root: true,
  env: {
    es2017: true
  },
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  parserOptions: {
    sourceType: "module", // Allows for the use of imports
    project: ["tsconfig.json"],
  },
  extends: [
    // Uses the recommended built-in rules from ESLint
    // https://eslint.org/docs/rules/
    "eslint:recommended",
    // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    // https://github.com/typescript-eslint/typescript-eslint/tree/master/packages/eslint-plugin
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking"
  ],
  rules: {
    /**
     * Enabled formatting options (should be raised as warnings only)
     */
    "array-bracket-spacing": ["warn"],
    "arrow-spacing": ["warn"],
    "curly": ["warn"],
    // TODO: replace with @typescript-eslint/indent in the future,
    // see https://github.com/typescript-eslint/typescript-eslint/issues/1824
    "indent": ["warn", 2, {"SwitchCase": 1, "flatTernaryExpressions": true}],
    "key-spacing": ["warn", {"mode": "strict"}],
    "max-len": ["warn", {"code": 120, "ignoreUrls": true}],
    "no-irregular-whitespace": ["warn"],
    "no-multi-spaces": ["warn"],
    "no-trailing-spaces": ["warn"],
    "no-whitespace-before-property": ["warn"],
    "space-before-blocks": ["warn"],
    "space-in-parens": ["warn"],
    "space-unary-ops": ["warn"],
    "yield-star-spacing": ["warn"],
    "@typescript-eslint/keyword-spacing": ["warn"],
    "@typescript-eslint/member-delimiter-style": ["warn"],
    // Unlike TSLint, ESLint always warns on arrow function properties in classes:
    // https://github.com/typescript-eslint/typescript-eslint/issues/2633
    "@typescript-eslint/semi": ["warn"],
    "@typescript-eslint/space-before-function-paren": ["warn", {
      "anonymous": "always",
      "named": "never",
      "asyncArrow": "always"
    }],
    "@typescript-eslint/space-infix-ops": ["warn"],
    "@typescript-eslint/type-annotation-spacing": ["warn"],
    "@typescript-eslint/quotes": ["warn", "single", {"allowTemplateLiterals": true}],

    /**
     * Disabled recommended rules
     */
    // Already handled by TypeScript
    "constructor-super": "off",
    // Accidental re-assignment is already handled by TypeScript
    "no-cond-assign": "off",
    "no-control-regex": "off",
    // No need in TypeScript, causes errors in namespace blocks:
    // https://github.com/typescript-eslint/typescript-eslint/issues/239
    "no-inner-declarations": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    // Allow empty interfaces for component props
    "@typescript-eslint/no-empty-interface": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/no-misused-promises": "off",
    // We use namespace blocks for grouping, not as modules
    "@typescript-eslint/no-namespace": "off",
    // Non-null assertions used very frequently in Ontodia
    "@typescript-eslint/no-non-null-assertion": "off",
    // Disabled as it produces too many false positives on existing codebase
    "@typescript-eslint/no-unnecessary-type-assertion": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-use-before-define": "off",
    "@typescript-eslint/no-var-requires": "off",

    /**
     * Enabled additional rules
     */
    "eqeqeq": ["warn"],
    "no-console": ["warn", {"allow": ["warn", "error"]}],
    "@typescript-eslint/ban-tslint-comment": ["warn"],
    "@typescript-eslint/consistent-type-assertions": ["warn", {
      "assertionStyle": "as",
      "objectLiteralTypeAssertions": "allow"
    }],
    "@typescript-eslint/explicit-member-accessibility": ["warn", {
      "accessibility": "no-public"
    }],
    "@typescript-eslint/no-throw-literal": ["error"],

    /**
     * Changed rules
     */
    // Changed to allow let with destructuring even if only some variable are mutated
    "prefer-const": ["warn", {"destructuring": "all"}],
    // Changed to allow "while (true)" loops
    "no-constant-condition": ["warn", {"checkLoops": false}],
    "no-extra-boolean-cast": ["warn"],
    "no-useless-escape": ["warn"],
    "no-var": ["warn"],
    // Changed to allow empty private and protected constructors
    "@typescript-eslint/no-empty-function": ["warn", {
      "allow": ["private-constructors", "protected-constructors"]
    }],
    "@typescript-eslint/no-extra-semi": ["warn"],
    "@typescript-eslint/no-inferrable-types": ["warn"],
    "@typescript-eslint/prefer-as-const": ["warn"],
    "@typescript-eslint/prefer-namespace-keyword": ["warn"],
    "@typescript-eslint/prefer-regexp-exec": ["warn"],
    "@typescript-eslint/restrict-plus-operands": ["warn"],
    "@typescript-eslint/restrict-template-expressions": ["warn", {
      "allowNumber": true,
      "allowBoolean": true,
      "allowNullish": true
    }],
    "@typescript-eslint/unbound-method": ["error", {"ignoreStatic": true}],
  },
  ignorePatterns: ["*.js", "*.d.ts", "**/node_modules/*"],
};
