import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class UpdateAppointmentDto {
  @ApiPropertyOptional({
    name: 'start_at',
    description: 'New scheduled start time ISO 8601 UTC (snake_case in request)',
    example: '2026-11-01T02:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  @Trim()
  public startAt?: string;

  @ApiPropertyOptional({
    name: 'service_type_ids',
    description: 'Updated service type identifiers (snake_case in request)',
    example: ['1'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  public serviceTypeIds?: string[];

  @ApiPropertyOptional({
    name: 'vehicle_id',
    description: 'Updated customer vehicle identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public vehicleId?: string;

  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'Updated technician identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({
    name: 'customer_notes',
    description: 'Customer notes or requests (snake_case in request)',
    example: 'Please inspect the front brake pads',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public customerNotes?: string;

  @ApiPropertyOptional({
    name: 'notes',
    description: 'Optional operational or customer notes',
    example: 'Please inspect the front brake pads',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock version expected in database', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;
}
