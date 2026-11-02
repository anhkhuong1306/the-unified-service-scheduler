import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class ReassignAppointmentDto {
  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'New technician identifier (snake_case in request)',
    example: '2',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({
    name: 'service_bay_id',
    description: 'New service bay identifier (snake_case in request)',
    example: '3',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public serviceBayId?: string;

  @ApiPropertyOptional({
    description: 'Reason for staff reassignment',
    example: 'Primary technician requested reassignment',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;

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
