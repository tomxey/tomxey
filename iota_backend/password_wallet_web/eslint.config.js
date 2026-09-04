// Lint rules chosen from bugs this app actually shipped, not from a style
// preference. Each of the three below cost a deploy and a bug report:
//
//   no-undef          the portions reset button referenced `entry`, which is
//                     not in scope there, so every click threw and the button
//                     did nothing at all
//   no-return-assign  `(c) => (c.done = !c.done)` returns the assigned value,
//                     and a change that started treating a returned value as
//                     replacement content put a boolean where item content
//                     belonged, blanking the whole list
//   no-unused-vars    dead imports and leftovers after refactors
//
// Formatting is deliberately not linted; it is not what has gone wrong.

const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  structuredClone: 'readonly',
  Worker: 'readonly',
  PasswordCredential: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  globalThis: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Buffer: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  crypto: 'readonly',
  structuredClone: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-return-assign': ['error', 'always'],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-cond-assign': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-self-compare': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
};

export default [
  {
    // A Web Worker has no `window`; its global is `self`.
    files: ['src/kdf-worker.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...browserGlobals, self: 'readonly' },
    },
    rules,
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/kdf-worker.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules,
  },
  {
    files: ['test/**/*.js', 'tools/**/*.js', 'tools/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules,
  },
];
