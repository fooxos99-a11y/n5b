import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default ts.config(
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'android/**', 'ios/**', '.tools-venv/**', 'artifacts/**'] },
  js.configs.recommended,
  ...ts.configs.recommended.map(config => ({ ...config, files: ['**/*.{ts,tsx}'] })),
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: {
    'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
);
