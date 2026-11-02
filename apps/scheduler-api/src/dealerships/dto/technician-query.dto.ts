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

  @ApiPropertyOptional({ description: 'Optional service type identifier filter' })
  @IsOptional()
  @IsString()
  public service_type_id?: string;

  @ApiPropertyOptional({ description: 'Optional service type identifier filter (camelCase alias)' })
  @IsOptional()
  @IsString()
  public serviceTypeId?: string;

  @ApiPropertyOptional({ description: 'Optional slot start time ISO 8601 UTC' })
  @IsOptional()
  @IsString()
  public start_at?: string;

  @ApiPropertyOptional({ description: 'Optional slot start time ISO 8601 UTC (camelCase alias)' })
  @IsOptional()
  @IsString()
  public startAt?: string;

  @ApiPropertyOptional({ description: 'Optional cursor for backwards-compatible seeking' })
  @IsOptional()
  @IsString()
  public cursor?: string;
}
