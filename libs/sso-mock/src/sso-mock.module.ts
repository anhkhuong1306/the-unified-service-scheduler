import { DynamicModule, Module } from '@nestjs/common';

/**
 * Minimal Mock OIDC Identity Provider (`@app/sso-mock` — local/test only, §10).
 *
 * Emulates an external OIDC IdP (`/.well-known/openid-configuration`, `/oauth/jwks`,
 * `POST /oauth/token` with RS256 signing via `jose`). Mounted conditionally when
 * `SSO_MOCK_ENABLED=true`.
 */
@Module({})
export class SsoMockModule {
  static registerWhenEnabled(): DynamicModule {
    const enabled =
      String(process.env.SSO_MOCK_ENABLED ?? 'true').toLowerCase() !== 'false';

    if (!enabled) {
      return {
        module: SsoMockModule,
        imports: [],
        controllers: [],
        providers: [],
        exports: [],
      };
    }

    return {
      module: SsoMockModule,
      imports: [],
      controllers: [],
      providers: [],
      exports: [],
    };
  }
}
