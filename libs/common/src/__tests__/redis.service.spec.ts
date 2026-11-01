import { RedisService } from '../redis/redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: any;
  let mockMulti: any;

  beforeEach(() => {
    mockMulti = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1]]),
    };

    mockRedisClient = {
      status: 'ready',
      get: jest.fn(),
      set: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
      hgetall: jest.fn(),
      hdel: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
      unlink: jest.fn(),
      multi: jest.fn(() => mockMulti),
      scanStream: jest.fn(),
      on: jest.fn(),
    };

    service = new RedisService(mockRedisClient);
  });

  describe('isAvailable', () => {
    it('should return true when status is ready', () => {
      mockRedisClient.status = 'ready';
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when status is not ready', () => {
      mockRedisClient.status = 'connecting';
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('String operations (get, set, exists, incr)', () => {
    it('should get parsed JSON data and return null on miss', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ a: 1 }));
      const val = await service.get<{ a: number }>('k');
      expect(val).toEqual({ a: 1 });

      mockRedisClient.get.mockResolvedValue(null);
      expect(await service.get('missing')).toBeNull();
    });

    it('should set with EX when ttlSeconds provided', async () => {
      await service.set('k', { a: 1 }, 60);
      expect(mockRedisClient.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), 'EX', 60);
    });

    it('should check existence', async () => {
      mockRedisClient.exists.mockResolvedValue(1);
      expect(await service.exists('k')).toBe(true);
    });

    it('should increment with atomic multi expire', async () => {
      mockMulti.exec.mockResolvedValue([[null, 5], [null, 1]]);
      const count = await service.incr('k', 60);
      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockMulti.incr).toHaveBeenCalledWith('k');
      expect(mockMulti.expire).toHaveBeenCalledWith('k', 60, 'NX');
      expect(count).toBe(5);
    });
  });

  describe('Hash operations (hget, hset, hmset, hgetall, hdel)', () => {
    it('should hget and parse JSON', async () => {
      mockRedisClient.hget.mockResolvedValue(JSON.stringify({ id: '1' }));
      const res = await service.hget<{ id: string }>('h', '1');
      expect(res).toEqual({ id: '1' });
    });

    it('should hset atomically with multi when TTL provided', async () => {
      mockMulti.exec.mockResolvedValue([[null, 1], [null, 1]]);
      await service.hset('h', '1', { id: '1' }, 3600);
      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockMulti.hset).toHaveBeenCalledWith('h', '1', JSON.stringify({ id: '1' }));
      expect(mockMulti.expire).toHaveBeenCalledWith('h', 3600);
    });

    it('should hmset multiple fields atomically', async () => {
      mockMulti.exec.mockResolvedValue([[null, 2], [null, 1]]);
      await service.hmset('h', { '1': { id: '1' }, '2': { id: '2' } }, 3600);
      expect(mockMulti.hset).toHaveBeenCalledWith('h', {
        '1': JSON.stringify({ id: '1' }),
        '2': JSON.stringify({ id: '2' }),
      });
      expect(mockMulti.expire).toHaveBeenCalledWith('h', 3600);
    });

    it('should hgetall and parse all JSON fields safely', async () => {
      mockRedisClient.hgetall.mockResolvedValue({
        '1': JSON.stringify({ id: '1' }),
        '2': JSON.stringify({ id: '2' }),
      });
      const all = await service.hgetall<{ id: string }>('h');
      expect(all).toEqual({
        '1': { id: '1' },
        '2': { id: '2' },
      });
    });

    it('should hdel fields', async () => {
      mockRedisClient.hdel.mockResolvedValue(2);
      const deleted = await service.hdel('h', '1', '2');
      expect(deleted).toBe(2);
    });
  });

  describe('Key operations (del, expire, delByPattern)', () => {
    it('should del and expire', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      expect(await service.del('k')).toBe(1);

      mockRedisClient.expire.mockResolvedValue(1);
      expect(await service.expire('k', 100)).toBe(true);
    });

    it('should delByPattern using scanStream and unlink', async () => {
      mockRedisClient.scanStream.mockReturnValue((async function* () {
        yield ['k1', 'k2'];
        yield ['k3'];
      })());
      mockRedisClient.unlink.mockResolvedValue(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const count = await service.delByPattern('cache:*');
      expect(mockRedisClient.unlink).toHaveBeenCalledWith('k1', 'k2');
      expect(mockRedisClient.unlink).toHaveBeenCalledWith('k3');
      expect(count).toBe(3);
    });
  });

  describe('Graceful degradation when offline', () => {
    it('should return default values without throwing when status is not ready', async () => {
      mockRedisClient.status = 'end';

      expect(await service.get('k')).toBeNull();
      expect(await service.exists('k')).toBe(false);
      expect(await service.incr('k')).toBeNull();
      expect(await service.hget('h', 'f')).toBeNull();
      expect(await service.hgetall('h')).toEqual({});
      expect(await service.hdel('h', 'f')).toBe(0);
      expect(await service.del('k')).toBe(0);
      expect(await service.expire('k', 10)).toBe(false);
      expect(await service.delByPattern('pattern')).toBe(0);
    });
  });
});
