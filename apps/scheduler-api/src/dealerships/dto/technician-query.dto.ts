import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';

export class TechnicianQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by technician code' })
  @IsOptional()
  @Trim()
  @IsString()
  public code?: string;

  @ApiPropertyOptional({ description: 'Filter by technician name' })
  @IsOptional()
  @Trim()
  @IsString()
  public name?: string;

  @ApiPropertyOptional({
    name: 'service_type_id',
    description: 'Optional service type identifier filter (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @IsString()
  public serviceTypeId?: string;

  @ApiPropertyOptional({
    name: 'start_at',
    description: 'Optional slot start time ISO 8601 UTC (snake_case in request)',
    example: '2026-11-01T08:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  public startAt?: string;

  @ApiPropertyOptional({ description: 'Optional cursor for backwards-compatible seeking' })
  @IsOptional()
  @IsString()
  public cursor?: string;
}
