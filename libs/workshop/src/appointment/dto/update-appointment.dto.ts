import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ description: 'New scheduled start time ISO 8601 UTC' })
  @IsOptional()
  @IsISO8601()
  @Trim()
  public startAt?: string;

  @ApiPropertyOptional({ description: 'Updated service type identifiers', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  public serviceTypeIds?: string[];

  @ApiPropertyOptional({ description: 'Updated customer vehicle identifier' })
  @IsOptional()
  @IsString()
  @Trim()
  public vehicleId?: string;

  @ApiPropertyOptional({ description: 'Updated technician identifier' })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'Customer notes or requests' })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @ApiPropertyOptional({ description: 'Customer notes alias (camelCase)' })
  @IsOptional()
  @IsString()
  @Trim()
  public customerNotes?: string;

  @ApiPropertyOptional({ description: 'Customer notes alias (snake_case)' })
  @IsOptional()
  @IsString()
  @Trim()
  public customer_notes?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock version expected in database', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  public version?: number;
}
