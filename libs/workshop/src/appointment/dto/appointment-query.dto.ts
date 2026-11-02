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
    name: 'reference_code',
    description: 'Filter by reference code (exact or partial, snake_case in request)',
    example: 'APT-20261101-ABCD',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public referenceCode?: string;

  @ApiPropertyOptional({
    name: 'customer_id',
    description: 'Filter by customer identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public customerId?: string;

  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'Filter by technician identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public technicianId?: string;

  @ApiPropertyOptional({
    name: 'service_type_id',
    description: 'Filter by service type identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public serviceTypeId?: string;

  @ApiPropertyOptional({
    name: 'dealership_id',
    description: 'Filter by dealership identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public dealershipId?: string;

  @ApiPropertyOptional({
    name: 'from_date',
    description: 'Filter by from date range (YYYY-MM-DD, snake_case in request)',
    example: '2026-11-01',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public fromDate?: string;

  @ApiPropertyOptional({
    name: 'to_date',
    description: 'Filter by to date range (YYYY-MM-DD, snake_case in request)',
    example: '2026-11-30',
  })
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
