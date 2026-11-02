import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { Trim } from '@app/common';

export class AppointmentAvailabilityQueryDto {
  @ApiPropertyOptional({
    name: 'dealership_id',
    description: 'Dealership identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public dealershipId?: string;

  @ApiPropertyOptional({
    description: 'Target date (YYYY-MM-DD), defaults to current date if omitted',
    example: '2026-11-02',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public date?: string;

  @ApiPropertyOptional({
    name: 'service_type_ids',
    description: 'Service type IDs filter (array or comma-separated, snake_case in request)',
    example: ['1', '2'],
  })
  @IsOptional()
  public serviceTypeIds?: string[] | string;

  @ApiPropertyOptional({
    name: 'technician_ids',
    description: 'Technician IDs filter (array or comma-separated, snake_case in request)',
    example: ['1', '2'],
  })
  @IsOptional()
  public technicianIds?: string[] | string;

  @ApiPropertyOptional({
    description: 'Page number for offset pagination',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  public page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size limit for offset pagination',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  public limit?: number = 10;
}
