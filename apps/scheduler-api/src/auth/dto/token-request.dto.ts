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
    description: 'Actor role: customer | staff',
    default: 'customer',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public role?: 'customer' | 'staff' = 'customer';

  @ApiPropertyOptional({
    description: 'Tenant ID',
    default: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public tenant_id?: string = '1';
}
