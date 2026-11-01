import { BadRequestException } from '@nestjs/common';
import { CursorPaginationHelper } from '../pagination/cursor-pagination.helper';

describe('CursorPaginationHelper', () => {
  describe('encode & decode', () => {
    it('should encode payload into a valid base64url string and decode it back', () => {
      const payload = { id: '100', sortValue: 12345 };
      const cursor = CursorPaginationHelper.encode(payload);

      expect(typeof cursor).toBe('string');
      expect(cursor).not.toContain('+');
      expect(cursor).not.toContain('/');
      expect(cursor).not.toContain('=');

      const decoded = CursorPaginationHelper.decode(cursor);
      expect(decoded.id).toBe('100');
      expect(decoded.sortValue).toBe(12345);
    });

    it('should throw BadRequestException when cursor is invalid base64 string', () => {
      expect(() => CursorPaginationHelper.decode('invalid!!!token')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when decoded JSON lacks string id', () => {
      const invalidJson = Buffer.from(JSON.stringify({ notId: 123 })).toString('base64url');
      expect(() => CursorPaginationHelper.decode(invalidJson)).toThrow(BadRequestException);
    });
  });

  describe('paginateArray', () => {
    const dataset = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
      { id: '3', name: 'Item 3' },
      { id: '4', name: 'Item 4' },
      { id: '5', name: 'Item 5' },
    ];

    it('should return first page with nextCursor when dataset exceeds limit', () => {
      const result = CursorPaginationHelper.paginateArray(dataset, { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('1');
      expect(result.items[1].id).toBe('2');
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.nextCursor).toBeDefined();

      const decoded = CursorPaginationHelper.decode(result.meta.nextCursor!);
      expect(decoded.id).toBe('2');
    });

    it('should return second page when valid cursor is provided', () => {
      const firstPage = CursorPaginationHelper.paginateArray(dataset, { limit: 2 });
      const secondPage = CursorPaginationHelper.paginateArray(dataset, {
        cursor: firstPage.meta.nextCursor!,
        limit: 2,
      });

      expect(secondPage.items).toHaveLength(2);
      expect(secondPage.items[0].id).toBe('3');
      expect(secondPage.items[1].id).toBe('4');
      expect(secondPage.meta.hasMore).toBe(true);
    });

    it('should return last page with nextCursor = null and hasMore = false', () => {
      const cursor = CursorPaginationHelper.encode({ id: '4' });
      const lastPage = CursorPaginationHelper.paginateArray(dataset, {
        cursor,
        limit: 2,
      });

      expect(lastPage.items).toHaveLength(1);
      expect(lastPage.items[0].id).toBe('5');
      expect(lastPage.meta.hasMore).toBe(false);
      expect(lastPage.meta.nextCursor).toBeNull();
    });

    it('should clamp limit between 1 and 100', () => {
      const resultMin = CursorPaginationHelper.paginateArray(dataset, { limit: 0 });
      expect(resultMin.meta.limit).toBe(20); // Default when 0/invalid

      const resultMax = CursorPaginationHelper.paginateArray(dataset, { limit: 200 });
      expect(resultMax.meta.limit).toBe(100);
    });
  });

  describe('paginateQueryBuilder', () => {
    it('should construct appropriate query builder where conditions and take limit + 1', async () => {
      const mockQueryBuilder: any = {
        alias: 'item',
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: '10', title: 'A' },
          { id: '11', title: 'B' },
          { id: '12', title: 'C' },
        ]),
      };

      const result = await CursorPaginationHelper.paginateQueryBuilder(
        mockQueryBuilder,
        { limit: 2 },
        { sortField: 'id', sortOrder: 'ASC' },
      );

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(3);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('item.id', 'ASC');
      expect(result.items).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).toBeDefined();
    });
  });
});
