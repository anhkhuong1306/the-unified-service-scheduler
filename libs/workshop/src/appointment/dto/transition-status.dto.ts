import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class TransitionStatusDto {
  @ApiPropertyOptional({ description: 'Optional operational reason or note', example: 'Vehicle checked in and ready for service' })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;

  @ApiPropertyOptional({ description: 'Optional technician notes', example: 'Inspected vehicle brakes and oil level' })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'Optional technician identifier (snake_case in request)',
    example: '2',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock version expected in database', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;
}
