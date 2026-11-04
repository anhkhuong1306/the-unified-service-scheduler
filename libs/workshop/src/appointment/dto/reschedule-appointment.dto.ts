import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class RescheduleAppointmentDto {
  @ApiPropertyOptional({
    name: 'start_at',
    description: 'New scheduled start time ISO 8601 UTC (snake_case in request)',
    example: '2026-11-01T03:00:00.000Z',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public startAt?: string;

  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'Optional re-assigned technician identifier (snake_case in request)',
    example: '2',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({
    description: 'Reason for early arrival / reschedule (stored in audit log)',
    example: 'Customer arrived early for check-in',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;

  @ApiPropertyOptional({
    description: 'Additional staff operational notes',
    example: 'Customer arrived early at workshop reception',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @ApiPropertyOptional({
    description: 'Optimistic lock version expected in database',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;
}
