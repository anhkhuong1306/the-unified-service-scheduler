import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ServiceType } from '../entities/service-type.entity';
import { ResourceNotFoundException } , DEFAULT_TENANT_ID } from '@app/common';

@Injectable()
export class ServiceTypeRepository {
  public constructor(
    @InjectRepository(ServiceType)
    private readonly repo: Repository<ServiceType>,
  ) {}

  public async findById(
    id: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType | null> {
    const repository = manager ? manager.getRepository(ServiceType) : this.repo;
    return repository.findOne({
      where: { id, tenantId },
    });
  }

  public async getByIdOrFail(
    id: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType> {
    const st = await this.findById(id, tenantId, manager);
    if (!st) {
      throw new ResourceNotFoundException(`Service type ${id} not found`);
    }
    return st;
  }

  public async findByIds(
    ids: string[],
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    const repository = manager ? manager.getRepository(ServiceType) : this.repo;
    return repository.find({
      where: { id: In(ids), tenantId },
    });
  }

  public async getByIdsOrFail(
    ids: string[],
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType[]> {
    return Promise.all(ids.map((id) => this.getByIdOrFail(id, tenantId, manager)));
  }

  public async findAll(tenantId: string = DEFAULT_TENANT_ID): Promise<ServiceType[]> {
    return this.repo.find({
      where: { tenantId },
      order: { id: 'ASC' },
    });
  }
}
