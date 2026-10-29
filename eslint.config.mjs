import boundaries from 'eslint-plugin-boundaries';

/**
 * Architectural Module Boundary Rules (SYSTEM_DESIGN.md §3.1)
 *
 * Enforces strict bounded-context isolation in the NestJS Monorepo:
 * - `@app/workshop` may ONLY import from `@app/common`, `@app/contracts`, or itself.
 *   Direct imports from `@app/crm`, `@app/organization`, or `@app/sso-mock` are forbidden.
 * - `@app/crm` and `@app/organization` may ONLY import from `@app/common`, `@app/contracts`, or themselves.
 * - `@app/contracts` is a pure interface/DTO contract package and may not depend on domain modules.
 */
export default [
  {
    files: ['apps/**/*.ts', 'libs/**/*.ts'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app-api', pattern: 'apps/scheduler-api/**' },
        { type: 'app-worker', pattern: 'apps/scheduler-worker/**' },
        { type: 'common', pattern: 'libs/common/**' },
        { type: 'contracts', pattern: 'libs/contracts/**' },
        { type: 'workshop', pattern: 'libs/workshop/**' },
        { type: 'crm', pattern: 'libs/crm/**' },
        { type: 'organization', pattern: 'libs/organization/**' },
        { type: 'sso-mock', pattern: 'libs/sso-mock/**' },
      ],
    },
    rules: {
      'no-console': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: ['app-api'],
              allow: ['common', 'contracts', 'workshop', 'crm', 'organization', 'sso-mock'],
            },
            {
              from: ['app-worker'],
              allow: ['common', 'contracts', 'workshop'],
            },
            {
              from: ['common'],
              allow: ['common', 'contracts'],
            },
            {
              from: ['contracts'],
              allow: ['contracts'],
            },
            {
              from: ['workshop'],
              allow: ['workshop', 'common', 'contracts'],
            },
            {
              from: ['crm'],
              allow: ['crm', 'common', 'contracts'],
            },
            {
              from: ['organization'],
              allow: ['organization', 'common', 'contracts'],
            },
            {
              from: ['sso-mock'],
              allow: ['sso-mock', 'common', 'contracts'],
            },
          ],
        },
      ],
    },
  },
];
