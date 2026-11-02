import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Trim } from '@app/common';

export class CancelAppointmentDto {
  @ApiPropertyOptional({
    description: 'Optional human-readable reason for cancellation',
    example: 'Customer schedule conflict',
    maxLength: 255,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  public reason?: string;

  @ApiPropertyOptional({ description: 'Optimistic lock version expected in database', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;
}
