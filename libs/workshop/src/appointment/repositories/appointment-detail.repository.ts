import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppointmentDetail } from '../entities/appointment-detail.entity';
import { HydratedServiceTypeDetail } from '../types/appointment-hydration.params';

interface RawServiceTypeRow {
  id: string | number;
  code: string;
  name: string;
  durationMinutes: string | number;
}

@Injectable()
export class AppointmentDetailRepository {
  public constructor(
    @InjectRepository(AppointmentDetail)
    private readonly repo: Repository<AppointmentDetail>,
    private readonly dataSource: DataSource,
  ) {}

  public async findDetailsByAppointmentId(appointmentId: string): Promise<AppointmentDetail[]> {
    return this.repo.find({
      where: { appointmentId },
      order: { sequenceOrder: 'ASC' },
    });
  }

  public async findServiceTypesByIds(typeIds: string[]): Promise<HydratedServiceTypeDetail[]> {
    if (!typeIds || typeIds.length === 0) {
      return [];
    }
    const rawTypes = await this.dataSource.query<RawServiceTypeRow[]>(
      `SELECT id, code, name, duration_minutes as "durationMinutes" FROM service_types WHERE id = ANY($1)`,
      [typeIds],
    );
    return rawTypes.map((st: RawServiceTypeRow) => ({
      id: String(st.id),
      code: st.code,
      name: st.name,
      durationMinutes: Number(st.durationMinutes),
    }));
  }

  public async saveDetails(details: AppointmentDetail[]): Promise<AppointmentDetail[]> {
    return this.repo.save(details);
  }

  public async deleteByAppointmentIdTransactional(
    manager: EntityManager,
    appointmentId: string,
  ): Promise<void> {
    await manager.delete(AppointmentDetail, { appointmentId });
  }

  public async saveDetailsTransactional(
    manager: EntityManager,
    details: AppointmentDetail[],
  ): Promise<AppointmentDetail[]> {
    return manager.save(AppointmentDetail, details);
  }
}
