import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { WorkshopSettings } from '../entities/workshop-settings.entity';
import { ResourceNotFoundException } , DEFAULT_TENANT_ID } from '@app/common';

@Injectable()
export class WorkshopSettingsRepository {
  public constructor(
    @InjectRepository(WorkshopSettings)
    private readonly repo: Repository<WorkshopSettings>,
  ) {}

  public async findByDealershipId(
    dealershipId: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<WorkshopSettings | null> {
    const repository = manager ? manager.getRepository(WorkshopSettings) : this.repo;
    return repository.findOne({
      where: { dealershipId, tenantId },
    });
  }

  public async getByDealershipIdOrFail(
    dealershipId: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<WorkshopSettings> {
    const settings = await this.findByDealershipId(dealershipId, tenantId, manager);
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop settings not found for dealership ${dealershipId}`,
      );
    }
    return settings;
  }

  public async save(settings: WorkshopSettings, manager?: EntityManager): Promise<WorkshopSettings> {
    const repository = manager ? manager.getRepository(WorkshopSettings) : this.repo;
    return repository.save(settings);
  }
}
