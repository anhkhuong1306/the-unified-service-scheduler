import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class SwapAppointmentsDto {
  @ApiPropertyOptional({ description: 'First appointment UUID' })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentIdA?: string;

  @ApiPropertyOptional({ description: 'Second appointment UUID' })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentIdB?: string;

  @ApiPropertyOptional({ description: 'First appointment UUID alias' })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentId1?: string;

  @ApiPropertyOptional({ description: 'Second appointment UUID alias' })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentId2?: string;

  @ApiPropertyOptional({ description: 'First appointment UUID snake_case alias' })
  @IsOptional()
  @IsString()
  @Trim()
  public appointment_id_1?: string;

  @ApiPropertyOptional({ description: 'Second appointment UUID snake_case alias' })
  @IsOptional()
  @IsString()
  @Trim()
  public appointment_id_2?: string;

  @ApiPropertyOptional({ description: 'Reason for atomic schedule swap' })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;
}
