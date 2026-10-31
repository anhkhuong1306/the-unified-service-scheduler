import { WorkshopCacheService } from '../workshop-cache.service';
import { RedisService } from '@app/common';
import { WorkshopSettings } from '../../settings/workshop-settings.entity';
import { Technician } from '../../resource/technician.entity';
import { ServiceBay } from '../../resource/service-bay.entity';

describe('WorkshopCacheService', () => {
  let cacheService: WorkshopCacheService;
  let mockRedis: jest.Mocked<Partial<RedisService>>;
  let mockSettingsRepo: any;
  let mockTechRepo: any;
  let mockBayRepo: any;

  beforeEach(() => {
    mockRedis = {
      hget: jest.fn(),
      hset: jest.fn(),
      hgetall: jest.fn(),
      hmset: jest.fn(),
      hdel: jest.fn(),
      del: jest.fn(),
    };

    mockSettingsRepo = {
      findOne: jest.fn(),
    };

    mockTechRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockBayRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    cacheService = new WorkshopCacheService(
      mockRedis as RedisService,
      mockSettingsRepo,
      mockTechRepo,
      mockBayRepo,
    );
  });

  describe('Keys pattern verification', () => {
    it('should isolate keys by tenant and dealership', () => {
      expect(cacheService.getSettingsKey('10', '2')).toBe('tenant:2:dealership:10:settings');
      expect(cacheService.getTechniciansKey('10', '2')).toBe('tenant:2:dealership:10:technicians');
      expect(cacheService.getBaysKey('10', '2')).toBe('tenant:2:dealership:10:bays');
    });
  });

  describe('getSettings', () => {
    const mockSettings: Partial<WorkshopSettings> = {
      dealershipId: '10',
      tenantId: '1',
      timezone: 'Asia/Ho_Chi_Minh',
      slotMinutes: 30,
    };

    it('should return from Redis Hash on cache hit and avoid database query', async () => {
      mockRedis.hget!.mockResolvedValue(mockSettings as WorkshopSettings);

      const result = await cacheService.getSettings('10', '1');

      expect(mockRedis.hget).toHaveBeenCalledWith('tenant:1:dealership:10:settings', 'config');
      expect(mockSettingsRepo.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(mockSettings);
    });

    it('should query PostgreSQL and warm Redis Hash on cache miss', async () => {
      mockRedis.hget!.mockResolvedValue(null);
      mockSettingsRepo.findOne.mockResolvedValue(mockSettings);

      const result = await cacheService.getSettings('10', '1');

      expect(mockRedis.hget).toHaveBeenCalledWith('tenant:1:dealership:10:settings', 'config');
      expect(mockSettingsRepo.findOne).toHaveBeenCalledWith({
        where: { dealershipId: '10', tenantId: '1' },
      });
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'tenant:1:dealership:10:settings',
        'config',
        mockSettings,
        86400,
      );
      expect(result).toEqual(mockSettings);
    });
  });

  describe('getTechnicians', () => {
    const mockTechnicians: Partial<Technician>[] = [
      { id: '1', dealershipId: '10', tenantId: '1', name: 'Tech 1', isActive: true },
      { id: '2', dealershipId: '10', tenantId: '1', name: 'Tech 2', isActive: true },
    ];

    it('should return technician list directly from Redis Hash without querying DB', async () => {
      mockRedis.hgetall!.mockResolvedValue({
        '1': mockTechnicians[0],
        '2': mockTechnicians[1],
      });

      const result = await cacheService.getTechnicians('10', '1');

      expect(mockRedis.hgetall).toHaveBeenCalledWith('tenant:1:dealership:10:technicians');
      expect(mockTechRepo.find).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should fetch from DB and populate Redis Hash when cache is empty', async () => {
      mockRedis.hgetall!.mockResolvedValue({});
      mockTechRepo.find.mockResolvedValue(mockTechnicians);

      const result = await cacheService.getTechnicians('10', '1');

      expect(mockTechRepo.find).toHaveBeenCalledWith({
        where: { dealershipId: '10', tenantId: '1', isActive: true },
        relations: ['technicianSkills'],
        order: { id: 'ASC' },
      });
      expect(mockRedis.hmset).toHaveBeenCalledWith(
        'tenant:1:dealership:10:technicians',
        {
          '1': mockTechnicians[0],
          '2': mockTechnicians[1],
        },
        86400,
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getBays', () => {
    const mockBays: Partial<ServiceBay>[] = [
      { id: '101', dealershipId: '10', tenantId: '1', code: 'BAY-01', isActive: true },
    ];

    it('should return bays from cache when present', async () => {
      mockRedis.hgetall!.mockResolvedValue({
        '101': mockBays[0],
      });

      const result = await cacheService.getBays('10', '1');
      expect(mockBayRepo.find).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should query DB and warm cache when bays cache is empty', async () => {
      mockRedis.hgetall!.mockResolvedValue({});
      mockBayRepo.find.mockResolvedValue(mockBays);

      const result = await cacheService.getBays('10', '1');
      expect(mockBayRepo.find).toHaveBeenCalled();
      expect(mockRedis.hmset).toHaveBeenCalledWith(
        'tenant:1:dealership:10:bays',
        { '101': mockBays[0] },
        86400,
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('invalidation', () => {
    it('should call del on invalidateSettings', async () => {
      await cacheService.invalidateSettings('10', '1');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:1:dealership:10:settings');
    });

    it('should call hdel on invalidateTechnician', async () => {
      await cacheService.invalidateTechnician('10', '5', '1');
      expect(mockRedis.hdel).toHaveBeenCalledWith('tenant:1:dealership:10:technicians', '5');
    });

    it('should call hdel on invalidateBay', async () => {
      await cacheService.invalidateBay('10', '101', '1');
      expect(mockRedis.hdel).toHaveBeenCalledWith('tenant:1:dealership:10:bays', '101');
    });
  });
});
