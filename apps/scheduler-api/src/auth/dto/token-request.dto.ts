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

  @ApiPropertyOptional({ description: 'User identifier alias (camelCase)' })
  @IsOptional()
  @Trim()
  @IsString()
  public userId?: string;

  @ApiPropertyOptional({ description: 'User identifier alias (snake_case)' })
  @IsOptional()
  @Trim()
  @IsString()
  public user_id?: string;

  @ApiPropertyOptional({
    description: 'Actor role: customer | staff',
    default: 'customer',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public role?: 'customer' | 'staff' = 'customer';

  @ApiPropertyOptional({ description: 'Array of actor roles' })
  @IsOptional()
  public roles?: string[] | string;

  @ApiPropertyOptional({
    description: 'Tenant ID',
    default: '1',
  })
  @IsOptional()
  public tenant_id?: string | number = '1';

  @ApiPropertyOptional({ description: 'Tenant ID (camelCase alias)' })
  @IsOptional()
  public tenantId?: string | number = '1';
}
