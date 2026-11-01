import { DEFAULT_TENANT_ID } from '@app/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ServiceBay } from '../entities/service-bay.entity';

@Injectable()
export class ServiceBayRepository {
  public constructor(
    @InjectRepository(ServiceBay)
    private readonly repo: Repository<ServiceBay>,
  ) {}

  public async findByDealership(
    dealershipId: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceBay[]> {
    const repository = manager ? manager.getRepository(ServiceBay) : this.repo;
    return repository.find({
      where: { dealershipId, tenantId, isActive: true },
      order: { id: 'ASC' },
    });
  }

  public async findById(
    id: string,
    dealershipId?: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceBay | null> {
    const repository = manager ? manager.getRepository(ServiceBay) : this.repo;
    const whereClause: Record<string, unknown> = { id, tenantId };
    if (dealershipId) {
      whereClause.dealershipId = dealershipId;
    }
    return repository.findOne({
      where: whereClause,
    });
  }
}
