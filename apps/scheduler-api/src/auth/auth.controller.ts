import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse, ApiResponseEnvelope, Public } from '@app/common';
import { TokenRequestDto, TokenResponse } from './dto';

@ApiTags('Authentication & Token')
@Controller({ path: 'v1/auth' })
export class AuthController {
  @Public()
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a valid JWT Bearer token for testing API requests in Postman or cURL',
  })
  public generateTokenPost(@Body() dto: TokenRequestDto): ApiResponseEnvelope<TokenResponse> {
    return this.createToken(dto);
  }

  @Public()
  @Get('token')
  @ApiOperation({
    summary: 'Generate a valid JWT Bearer token via GET request for quick browser/cURL testing',
  })
  public generateTokenGet(@Query() dto: TokenRequestDto): ApiResponseEnvelope<TokenResponse> {
    return this.createToken(dto);
  }

  private createToken(dto: TokenRequestDto): ApiResponseEnvelope<TokenResponse> {
    const sub = dto.sub || dto.userId || dto.user_id || 'a1111111-1111-1111-1111-111111111111';
    let role = dto.role || 'customer';
    if (dto.roles) {
      if (Array.isArray(dto.roles) && dto.roles.length > 0) {
        role = dto.roles.includes('staff') ? 'staff' : (dto.roles[0] as any);
      } else if (typeof dto.roles === 'string') {
        role = dto.roles as any;
      }
    }
    const tenantId = Number(dto.tenant_id ?? dto.tenantId ?? 1);

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub,
      roles: [role],
      tenant_id: tenantId,
      iss: 'http://localhost:3000',
      aud: 'scheduler-api',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days validity for easy testing
    };

    const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const mockSignature = Buffer.from('mock_signature_for_development', 'utf8').toString('base64url');

    const accessToken = `${encodedHeader}.${encodedPayload}.${mockSignature}`;

    return ApiResponse.success({
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 86400 * 30,
      claims: {
        sub,
        roles: [role],
        tenant_id: tenantId,
      },
    }, 'Token generated successfully');
  }
}
