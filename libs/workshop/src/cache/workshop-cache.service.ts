import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '@app/common';
import { WorkshopSettings } from '../settings/workshop-settings.entity';
import { Technician } from '../resource/technician.entity';
import { ServiceBay } from '../resource/service-bay.entity';

const CACHE_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class WorkshopCacheService {
  private readonly logger = new Logger(WorkshopCacheService.name);

  public constructor(
    private readonly redis: RedisService,
    @InjectRepository(WorkshopSettings)
    private readonly settingsRepo: Repository<WorkshopSettings>,
    @InjectRepository(Technician)
    private readonly technicianRepo: Repository<Technician>,
    @InjectRepository(ServiceBay)
    private readonly bayRepo: Repository<ServiceBay>,
  ) {}

  public getSettingsKey(dealershipId: string, tenantId: string = '1'): string {
    return `tenant:${tenantId}:dealership:${dealershipId}:settings`;
  }

  public getTechniciansKey(dealershipId: string, tenantId: string = '1'): string {
    return `tenant:${tenantId}:dealership:${dealershipId}:technicians`;
  }

  public getBaysKey(dealershipId: string, tenantId: string = '1'): string {
    return `tenant:${tenantId}:dealership:${dealershipId}:bays`;
  }

  /**
   * Retrieves WorkshopSettings for a dealership via Redis Hash, falling back to PostgreSQL.
   */
  public async getSettings(dealershipId: string, tenantId: string = '1'): Promise<WorkshopSettings | null> {
    const key = this.getSettingsKey(dealershipId, tenantId);
    const cached = await this.redis.hget<WorkshopSettings>(key, 'config');
    if (cached) {
      return cached;
    }

    const dbEntity = await this.settingsRepo.findOne({
      where: { dealershipId, tenantId },
    });
    if (dbEntity) {
      await this.redis.hset(key, 'config', dbEntity, CACHE_TTL_SECONDS);
    }
    return dbEntity;
  }

  /**
   * Invalidates or updates the cached WorkshopSettings for a dealership.
   */
  public async setSettings(dealershipId: string, settings: WorkshopSettings, tenantId: string = '1'): Promise<void> {
    const key = this.getSettingsKey(dealershipId, tenantId);
    await this.redis.hset(key, 'config', settings, CACHE_TTL_SECONDS);
  }

  public async invalidateSettings(dealershipId: string, tenantId: string = '1'): Promise<void> {
    const key = this.getSettingsKey(dealershipId, tenantId);
    await this.redis.del(key);
  }

  /**
   * Retrieves all active Technicians for a dealership via Redis Hash, falling back to PostgreSQL.
   */
  public async getTechnicians(dealershipId: string, tenantId: string = '1'): Promise<Technician[]> {
    const key = this.getTechniciansKey(dealershipId, tenantId);
    const cachedHash = await this.redis.hgetall<Technician>(key);
    const cachedList = Object.values(cachedHash);

    if (cachedList.length > 0) {
      return cachedList;
    }

    const dbEntities = await this.technicianRepo.find({
      where: { dealershipId, tenantId, isActive: true },
      relations: ['technicianSkills'],
      order: { id: 'ASC' },
    });

    if (dbEntities.length > 0) {
      const payload: Record<string, Technician> = {};
      for (const tech of dbEntities) {
        payload[tech.id] = tech;
      }
      await this.redis.hmset(key, payload, CACHE_TTL_SECONDS);
    }
    return dbEntities;
  }

  /**
   * Retrieves a single Technician by ID from the dealership's Redis Hash.
   */
  public async getTechnicianById(
    dealershipId: string,
    technicianId: string,
    tenantId: string = '1',
  ): Promise<Technician | null> {
    const key = this.getTechniciansKey(dealershipId, tenantId);
    const cached = await this.redis.hget<Technician>(key, technicianId);
    if (cached) {
      return cached;
    }

    const dbEntity = await this.technicianRepo.findOne({
      where: { id: technicianId, dealershipId, tenantId },
      relations: ['technicianSkills'],
    });
    if (dbEntity) {
      await this.redis.hset(key, technicianId, dbEntity, CACHE_TTL_SECONDS);
    }
    return dbEntity;
  }

  public async invalidateTechnician(dealershipId: string, technicianId: string, tenantId: string = '1'): Promise<void> {
    const key = this.getTechniciansKey(dealershipId, tenantId);
    await this.redis.hdel(key, technicianId);
  }

  /**
   * Retrieves all active ServiceBays for a dealership via Redis Hash, falling back to PostgreSQL.
   */
  public async getBays(dealershipId: string, tenantId: string = '1'): Promise<ServiceBay[]> {
    const key = this.getBaysKey(dealershipId, tenantId);
    const cachedHash = await this.redis.hgetall<ServiceBay>(key);
    const cachedList = Object.values(cachedHash);

    if (cachedList.length > 0) {
      return cachedList;
    }

    const dbEntities = await this.bayRepo.find({
      where: { dealershipId, tenantId, isActive: true },
      order: { id: 'ASC' },
    });

    if (dbEntities.length > 0) {
      const payload: Record<string, ServiceBay> = {};
      for (const bay of dbEntities) {
        payload[bay.id] = bay;
      }
      await this.redis.hmset(key, payload, CACHE_TTL_SECONDS);
    }
    return dbEntities;
  }

  /**
   * Retrieves a single ServiceBay by ID from the dealership's Redis Hash.
   */
  public async getBayById(
    dealershipId: string,
    bayId: string,
    tenantId: string = '1',
  ): Promise<ServiceBay | null> {
    const key = this.getBaysKey(dealershipId, tenantId);
    const cached = await this.redis.hget<ServiceBay>(key, bayId);
    if (cached) {
      return cached;
    }

    const dbEntity = await this.bayRepo.findOne({
      where: { id: bayId, dealershipId, tenantId },
    });
    if (dbEntity) {
      await this.redis.hset(key, bayId, dbEntity, CACHE_TTL_SECONDS);
    }
    return dbEntity;
  }

  public async invalidateBay(dealershipId: string, bayId: string, tenantId: string = '1'): Promise<void> {
    const key = this.getBaysKey(dealershipId, tenantId);
    await this.redis.hdel(key, bayId);
  }
}
