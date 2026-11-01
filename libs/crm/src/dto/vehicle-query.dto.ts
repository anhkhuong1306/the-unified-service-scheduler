import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';

export class VehicleQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by tenant ID',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public tenant_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public customer_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by license plate (partial or exact)',
    example: '51A-123.45',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public license_plate?: string;

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
