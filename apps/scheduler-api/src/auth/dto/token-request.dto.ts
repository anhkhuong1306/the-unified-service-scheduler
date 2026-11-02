import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class TokenRequestDto {
  @ApiPropertyOptional({
    description: 'User subject UUID (default: seeded customer Nguyen Van A)',
    default: 'a1111111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public sub?: string = 'a1111111-1111-1111-1111-111111111111';

  @ApiPropertyOptional({
    name: 'user_id',
    description: 'User identifier alias (snake_case in request)',
    example: 'a1111111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public userId?: string;

  @ApiPropertyOptional({
    description: 'Actor role: customer | staff',
    default: 'customer',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public role?: 'customer' | 'staff' = 'customer';

  @ApiPropertyOptional({ description: 'Array of actor roles (e.g. ["customer"] or ["staff"])' })
  @IsOptional()
  public roles?: string[] | string;

  @ApiPropertyOptional({
    name: 'tenant_id',
    description: 'Tenant ID (snake_case in request)',
    default: '1',
  })
  @IsOptional()
  public tenantId?: string | number = '1';
}
