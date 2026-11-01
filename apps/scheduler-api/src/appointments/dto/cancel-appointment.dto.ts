import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
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
}
