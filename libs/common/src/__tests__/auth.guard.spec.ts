import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../guards/auth.guard';
import { RequestContextService } from '../context/request-context.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('AuthGuard (Unit - Global Authentication)', () => {
  let guard: AuthGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new AuthGuard(mockReflector as unknown as Reflector);
  });

  const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const mockRequest = {
      headers,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('should bypass authentication when endpoint is marked with @Public()', () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const canActivate = guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('should extract actor from x-user-sub and x-actor-type mock headers', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({
      'x-user-sub': 'staff-user-uuid',
      'x-actor-type': 'staff',
      'x-tenant-id': '2',
    });

    const canActivate = guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(RequestContextService.getActorSub()).toBe('staff-user-uuid');
    expect(RequestContextService.getActorType()).toBe('staff');
    expect(RequestContextService.getTenantId()).toBe(2);
  });

  it('should extract actor from Bearer JWT token in Authorization header', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    // JWT with payload: { sub: "jwt-customer-sub", roles: ["customer"], tenant_id: 3 }
    const payload = { sub: 'jwt-customer-sub', roles: ['customer'], tenant_id: 3 };
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mockJwt = `header.${base64Payload}.signature`;

    const context = createMockContext({
      authorization: `Bearer ${mockJwt}`,
    });

    const canActivate = guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(RequestContextService.getActorSub()).toBe('jwt-customer-sub');
    expect(RequestContextService.getActorType()).toBe('customer');
    expect(RequestContextService.getTenantId()).toBe(3);
  });

  it('should fallback to default test customer if no credentials are provided in dev/test', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({});

    const canActivate = guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(RequestContextService.getActorSub()).toBe('a1111111-1111-1111-1111-111111111111');
    expect(RequestContextService.getActorType()).toBe('customer');
  });
});
