import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '@app/common';

export class TransitionStatusDto {
  @ApiPropertyOptional({ description: 'Optional operational reason or note' })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;

  @ApiPropertyOptional({ description: 'Optional technician notes' })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @ApiPropertyOptional({ description: 'Optional technician identifier (camelCase)' })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'Optional technician identifier (snake_case)' })
  @IsOptional()
  @IsString()
  @Trim()
  public technician_id?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock version expected in database', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;
}
