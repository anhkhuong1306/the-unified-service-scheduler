import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class RescheduleAppointmentDto {
  @ApiPropertyOptional({ description: 'New scheduled start time ISO 8601 UTC' })
  @IsOptional()
  @Trim()
  @IsString()
  public newStartAt?: string;

  @ApiPropertyOptional({ description: 'New scheduled start time ISO 8601 UTC (camelCase alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public startAt?: string;

  @ApiPropertyOptional({ description: 'New scheduled start time ISO 8601 UTC (snake_case alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public start_at?: string;

  @ApiPropertyOptional({ description: 'Optional re-assigned technician identifier' })
  @IsOptional()
  @IsString()
  @Trim()
  public requestedTechnicianId?: string;

  @ApiPropertyOptional({ description: 'Optional re-assigned technician identifier (camelCase alias)' })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'Optional re-assigned technician identifier (snake_case alias)' })
  @IsOptional()
  @IsString()
  @Trim()
  public technician_id?: string;

  @ApiPropertyOptional({ description: 'Reason or notes for early arrival / reschedule' })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @ApiPropertyOptional({ description: 'Reason alias' })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock version expected in database', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;
}
