import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global/Route-level Authentication Guard.
 *
 * Extracts OIDC JWT Bearer token or mock developer headers ('x-user-sub', 'x-actor-type', 'x-tenant-id'),
 * decodes actor credentials, and populates AsyncLocalStorage via RequestContextService.
 * Can be bypassed on endpoints annotated with `@Public()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    @Optional()
    private readonly reflector?: Reflector,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    // 1. Bypass authentication if endpoint or class is marked with @Public()
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];
    const mockUserSub = request.headers['x-user-sub'] as string | undefined;
    const mockActorType = (request.headers['x-actor-type'] as string) ?? 'customer';
    const tenantIdHeader = request.headers['x-tenant-id'] as string | undefined;

    let actorSub: string | null = null;
    let actorType: 'customer' | 'staff' | 'system' = 'customer';
    let tenantId = tenantIdHeader ? Number(tenantIdHeader) : 1;

    if (mockUserSub) {
      actorSub = mockUserSub;
      actorType = mockActorType === 'staff' ? 'staff' : 'customer';
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          actorSub = payload.sub ?? null;
          actorType = payload.roles?.includes('staff') ? 'staff' : 'customer';
          if (payload.tenant_id) {
            tenantId = Number(payload.tenant_id);
          }
        }
      } catch {
        // Fallback or ignore parse errors in mock mode
      }
    }

    if (!actorSub) {
      // Default to seeded test customer if in development/test environment
      actorSub = 'a1111111-1111-1111-1111-111111111111';
    }

    RequestContextService.setActor({
      actorSub,
      actorType,
      tenantId,
      roles: [actorType],
    });

    (request as unknown as { actor: { actorSub: string; actorType: string; tenantId: number } }).actor = {
      actorSub,
      actorType,
      tenantId,
    };

    return true;
  }
}
