import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class ReassignAppointmentDto {
  @ApiPropertyOptional({ description: 'New technician identifier' })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'New technician identifier (snake_case alias)' })
  @IsOptional()
  @IsString()
  @Trim()
  public technician_id?: string;

  @ApiPropertyOptional({ description: 'New service bay identifier' })
  @IsOptional()
  @IsString()
  @Trim()
  public serviceBayId?: string;

  @ApiPropertyOptional({ description: 'New service bay identifier (snake_case alias)' })
  @IsOptional()
  @IsString()
  @Trim()
  public service_bay_id?: string;

  @ApiPropertyOptional({ description: 'Reason for staff reassignment' })
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
