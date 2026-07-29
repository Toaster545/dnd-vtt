// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // Accessibility rules (label-has-associated-control, no-autofocus, click-events-have-key-events,
    // etc.) are deliberately left out for now — the existing templates have a lot of pre-existing
    // debt there, and fixing it is markup work that deserves its own deliberate pass rather than
    // riding along with wiring up CI linting.
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended],
    rules: {
      // `!= null` / `== null` deliberately checks both null and undefined at once — allow it
      // rather than forcing `!== null`, which would stop matching an undefined value.
      '@angular-eslint/template/eqeqeq': ['error', { allowNullOrUndefined: true }],
    },
  },
]);
