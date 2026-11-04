import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiDocSuccess,
  ApiResponse,
  ApiResponseEnvelope,
  Public,
} from '@app/common';
import { TokenRequestDto, TokenResponse } from './dto';
import {
  DEFAULT_MOCK_CUSTOMER_SUB,
  DEFAULT_MOCK_STAFF_SUB,
  SAMPLE_TOKEN_RESPONSE,
  TOKEN_REQUEST_BODY_EXAMPLES,
} from './samples/auth-swagger.samples';

@ApiTags('Authentication & Token')
@Controller({ path: 'v1/auth' })
export class AuthController {
  @Public()
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a valid JWT Bearer token for testing API requests in Postman or cURL',
  })
  @ApiBody({
    type: TokenRequestDto,
    description: 'Token request parameters',
    examples: TOKEN_REQUEST_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 200,
    description: 'JWT Bearer token generated successfully',
    example: SAMPLE_TOKEN_RESPONSE,
  })
  public generateTokenPost(@Body() dto: TokenRequestDto): ApiResponseEnvelope<TokenResponse> {
    return this.createToken(dto);
  }

  @Public()
  @Get('token')
  @ApiOperation({
    summary: 'Generate a valid JWT Bearer token via GET request for quick browser/cURL testing',
  })
  @ApiDocSuccess({
    status: 200,
    description: 'JWT Bearer token generated successfully',
    example: SAMPLE_TOKEN_RESPONSE,
  })
  public generateTokenGet(@Query() dto: TokenRequestDto): ApiResponseEnvelope<TokenResponse> {
    return this.createToken(dto);
  }

  private createToken(dto: TokenRequestDto): ApiResponseEnvelope<TokenResponse> {
    let role = dto.role || 'customer';
    if (dto.roles) {
      if (Array.isArray(dto.roles) && dto.roles.length > 0) {
        role = dto.roles.includes('staff') ? 'staff' : (dto.roles[0] as any);
      } else if (typeof dto.roles === 'string') {
        role = dto.roles as any;
      }
    }
    const sub =
      dto.userId ||
      dto.sub ||
      (role === 'staff' ? DEFAULT_MOCK_STAFF_SUB : DEFAULT_MOCK_CUSTOMER_SUB);
    const tenantId = Number(dto.tenantId ?? 1);

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
