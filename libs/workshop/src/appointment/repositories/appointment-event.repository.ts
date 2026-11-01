import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AppointmentEvent } from '../entities/appointment-event.entity';

@Injectable()
export class AppointmentEventRepository {
  public constructor(
    @InjectRepository(AppointmentEvent)
    private readonly repo: Repository<AppointmentEvent>,
  ) {}

  public async saveEvent(
    m: EntityManager,
    eventData: Partial<AppointmentEvent>,
  ): Promise<AppointmentEvent> {
    const event = m.create(AppointmentEvent, eventData);
    return m.save(AppointmentEvent, event);
  }

  public async notifyChannel(
    m: EntityManager,
    channel: string,
    payload: string,
  ): Promise<void> {
    await m.query(`SELECT pg_notify($1, $2)`, [channel, payload]);
  }
}
