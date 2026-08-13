import globals from 'globals';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/'],
  },
  {
    rules: {
      'indent': ['warn', 2, {
        flatTernaryExpressions: true,
        SwitchCase: 1,
      }],
      'no-console': ['warn', {
        allow: ['warn', 'error'],
      }],
      'no-constant-condition': ['error', {
        checkLoops: false,
      }],
      'no-control-regex': 'off',
      'quotes': ['warn', 'single'],
      'semi': ['warn', 'always'],
      '@typescript-eslint/no-misused-promises': ['warn', {
        checksVoidReturn: false,
      }],
      '@typescript-eslint/no-empty-object-type': ['warn', {
        allowInterfaces: 'with-single-extends',
        allowWithName: 'Props$',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-require-imports': ['warn', {
        allow: ['\\.(json|scss|svg|ttl)$'],
      }],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': ['warn', {
        ignoreStatic: true,
      }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    files: [
      'examples/**',
      'test/**'
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/eslint.config.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['**/vite.config.mts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
