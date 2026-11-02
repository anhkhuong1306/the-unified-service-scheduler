import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';

export class VehicleQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({
    name: 'tenant_id',
    description: 'Filter by tenant ID (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public tenantId?: string;

  @ApiPropertyOptional({
    name: 'customer_id',
    description: 'Filter by customer ID (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by vehicle code',
    example: 'VEH_001',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public code?: string;

  @ApiPropertyOptional({
    name: 'license_plate',
    description: 'Filter by license plate (partial or exact, snake_case in request)',
    example: '51A-123.45',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public licensePlate?: string;

  @ApiPropertyOptional({
    description: 'Filter by vehicle VIN',
    example: '1HGCR2F8XHA123456',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public vin?: string;

  @ApiPropertyOptional({
    description: 'Filter by vehicle model',
    example: 'Camry',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public model?: string;

  @ApiPropertyOptional({
    description: 'Optional cursor for backwards-compatible seeking / invalid token testing',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public cursor?: string;
}
