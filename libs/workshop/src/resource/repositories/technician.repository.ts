import { DEFAULT_TENANT_ID } from '@app/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Technician } from '../entities/technician.entity';

@Injectable()
export class TechnicianRepository {
  public constructor(
    @InjectRepository(Technician)
    private readonly repo: Repository<Technician>,
  ) {}

  public async findByDealership(
    dealershipId: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<Technician[]> {
    const repository = manager ? manager.getRepository(Technician) : this.repo;
    return repository.find({
      where: { dealershipId, tenantId, isActive: true },
      relations: ['technicianSkills'],
      order: { id: 'ASC' },
    });
  }

  public async findById(
    id: string,
    dealershipId?: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<Technician | null> {
    const repository = manager ? manager.getRepository(Technician) : this.repo;
    const whereClause: Record<string, unknown> = { id, tenantId };
    if (dealershipId) {
      whereClause.dealershipId = dealershipId;
    }
    return repository.findOne({
      where: whereClause,
      relations: ['technicianSkills'],
    });
  }
}
