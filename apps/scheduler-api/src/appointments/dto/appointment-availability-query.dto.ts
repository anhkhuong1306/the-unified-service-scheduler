import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { Trim } from '@app/common';

export class AppointmentAvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'Dealership identifier (snake_case alias)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealer_ship_id?: string;

  @ApiPropertyOptional({ description: 'Dealership identifier camelCase alias', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealerShipId?: string;

  @ApiPropertyOptional({ description: 'Dealership identifier (snake_case)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealership_id?: string;

  @ApiPropertyOptional({ description: 'Dealership identifier (camelCase)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealershipId?: string;

  @ApiPropertyOptional({ description: 'Target date (YYYY-MM-DD), defaults to current date if omitted', example: '2026-11-02' })
  @IsOptional()
  @Trim()
  @IsString()
  public date?: string;

  @ApiPropertyOptional({ description: 'Service type IDs filter (array or comma-separated)', example: ['1', '2'] })
  @IsOptional()
  public service_type_ids?: string[] | string;

  @ApiPropertyOptional({ description: 'Service type IDs filter (camelCase alias)' })
  @IsOptional()
  public serviceTypeIds?: string[] | string;

  @ApiPropertyOptional({ description: 'Single service type ID filter (backward compatibility)' })
  @IsOptional()
  @IsString()
  public service_type_id?: string;

  @ApiPropertyOptional({ description: 'Single service type ID filter (camelCase alias)' })
  @IsOptional()
  @IsString()
  public serviceTypeId?: string;

  @ApiPropertyOptional({ description: 'Technician IDs filter (array or comma-separated)', example: ['1', '2'] })
  @IsOptional()
  public technician_ids?: string[] | string;

  @ApiPropertyOptional({ description: 'Technician IDs filter (camelCase alias)' })
  @IsOptional()
  public technicianIds?: string[] | string;

  @ApiPropertyOptional({ description: 'Single technician ID filter (backward compatibility)' })
  @IsOptional()
  @IsString()
  public technician_id?: string;

  @ApiPropertyOptional({ description: 'Single technician ID filter (camelCase alias)' })
  @IsOptional()
  @IsString()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'Page number for offset pagination', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  public page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit for offset pagination', default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  public limit?: number = 10;

  @ApiPropertyOptional({ description: 'Page size limit (snake_case alias)' })
  @IsOptional()
  @Type(() => Number)
  public per_page?: number;

  @ApiPropertyOptional({ description: 'Page size limit (camelCase alias)' })
  @IsOptional()
  @Type(() => Number)
  public perPage?: number;
}
