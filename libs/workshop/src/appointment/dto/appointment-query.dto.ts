import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';
import { AppointmentStatus } from '../enums/appointment-status.enum';

export class AppointmentQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by appointment date (YYYY-MM-DD)',
    example: '2026-11-01',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public date?: string;

  @ApiPropertyOptional({
    description: 'Filter by reference code (exact or partial)',
    example: 'APT-20261101-ABCD',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public reference_code?: string;

  @ApiPropertyOptional({
    description: 'Filter by reference code (camelCase alias)',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public referenceCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer identifier or customer name',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public customer?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID (snake_case alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public customer_id?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID (camelCase alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by technician identifier',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public technician?: string;

  @ApiPropertyOptional({ description: 'Filter by technician ID (snake_case alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public technician_id?: string;

  @ApiPropertyOptional({ description: 'Filter by technician ID (camelCase alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public technicianId?: string;

  @ApiPropertyOptional({
    description: 'Filter by service type identifier',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public service_type?: string;

  @ApiPropertyOptional({
    description: 'Filter by service type identifier (camelCase alias)',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public serviceType?: string;

  @ApiPropertyOptional({
    description: 'Filter by dealership identifier',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public dealership_id?: string;

  @ApiPropertyOptional({ description: 'Filter by dealership ID (camelCase alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealershipId?: string;

  @ApiPropertyOptional({ description: 'Filter by from date range (YYYY-MM-DD)' })
  @IsOptional()
  @Trim()
  @IsString()
  public from_date?: string;

  @ApiPropertyOptional({ description: 'Filter by from date range (camelCase alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter by to date range (YYYY-MM-DD)' })
  @IsOptional()
  @Trim()
  @IsString()
  public to_date?: string;

  @ApiPropertyOptional({ description: 'Filter by to date range (camelCase alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public toDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by appointment operational status',
    enum: AppointmentStatus,
    example: AppointmentStatus.CONFIRMED,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  public status?: AppointmentStatus;

  @ApiPropertyOptional({
    description: 'Optional cursor for backwards-compatible seeking (or testing invalid cursor format)',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public cursor?: string;
}
