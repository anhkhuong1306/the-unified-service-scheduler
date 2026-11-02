import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class SwapAppointmentsDto {
  @ApiPropertyOptional({
    name: 'appointment_id_1',
    description: 'First appointment UUID (snake_case in request)',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentId1?: string;

  @ApiPropertyOptional({
    name: 'appointment_id_2',
    description: 'Second appointment UUID (snake_case in request)',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentId2?: string;

  @ApiPropertyOptional({
    name: 'appointment_id_a',
    description: 'First appointment UUID alias (appointmentIdA)',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentIdA?: string;

  @ApiPropertyOptional({
    name: 'appointment_id_b',
    description: 'Second appointment UUID alias (appointmentIdB)',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public appointmentIdB?: string;

  @ApiPropertyOptional({ description: 'Reason for atomic schedule swap', example: 'Customer requested swap with earlier slot' })
  @IsOptional()
  @IsString()
  @Trim()
  public reason?: string;
}
