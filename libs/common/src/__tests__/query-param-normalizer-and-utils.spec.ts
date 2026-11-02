import {
  toCamelCase,
  transformKeysToCamelCase,
  parseIds,
  getTodayDateString,
} from '../index';
import { QueryParamNormalizerMiddleware } from '../middlewares/query-param-normalizer.middleware';

describe('Common Utils & QueryParamNormalizerMiddleware', () => {
  describe('toCamelCase & transformKeysToCamelCase', () => {
    it('should convert snake_case and kebab-case strings to camelCase', () => {
      expect(toCamelCase('service_type_ids')).toBe('serviceTypeIds');
      expect(toCamelCase('dealership_id')).toBe('dealershipId');
      expect(toCamelCase('vehicle_id')).toBe('vehicleId');
      expect(toCamelCase('start_at')).toBe('startAt');
      expect(toCamelCase('customer_notes')).toBe('customerNotes');
      expect(toCamelCase('per_page')).toBe('perPage');
      expect(toCamelCase('kebab-case-key')).toBe('kebabCaseKey');
      expect(toCamelCase('alreadyCamelCase')).toBe('alreadyCamelCase');
    });

    it('should deeply convert nested objects and arrays to camelCase while preserving Dates', () => {
      const now = new Date();
      const input = {
        dealership_id: '123',
        filter_options: {
          service_type_ids: ['1', '2'],
          date_range: {
            start_date: now,
          },
        },
        items_list: [
          { item_id: '1', item_name: 'Item 1' },
          { item_id: '2', item_name: 'Item 2' },
        ],
      };

      const result = transformKeysToCamelCase<any>(input);

      expect(result.dealershipId).toBe('123');
      expect(result.filterOptions.serviceTypeIds).toEqual(['1', '2']);
      expect(result.filterOptions.dateRange.startDate).toBe(now);
      expect(result.itemsList[0].itemId).toBe('1');
      expect(result.itemsList[0].itemName).toBe('Item 1');
    });
  });

  describe('parseIds', () => {
    it('should parse single comma-separated string', () => {
      expect(parseIds('1, 2, 3')).toEqual(['1', '2', '3']);
    });

    it('should parse array of strings and comma-separated elements', () => {
      expect(parseIds(['1, 2', '3', ' '])).toEqual(['1', '2', '3']);
    });

    it('should return undefined for empty or invalid input', () => {
      expect(parseIds(undefined)).toBeUndefined();
      expect(parseIds('')).toBeUndefined();
      expect(parseIds([' ', ''])).toBeUndefined();
    });
  });

  describe('getTodayDateString', () => {
    it('should format date to YYYY-MM-DD in specified timezone', () => {
      const date = new Date('2026-11-01T18:30:00.000Z');
      const formatted = getTodayDateString(date, 'Asia/Ho_Chi_Minh');
      expect(formatted).toBe('2026-11-02');
    });
  });

  describe('QueryParamNormalizerMiddleware', () => {
    let middleware: QueryParamNormalizerMiddleware;

    beforeEach(() => {
      middleware = new QueryParamNormalizerMiddleware();
    });

    it('should generically normalize query, params, and body bidirectionally across all fields without hardcoded names', () => {
      const req: any = {
        query: {
          dealership_id: '1',
          service_type_ids: '1,2',
          per_page: 25,
        },
        params: {
          dealership_id: '10',
        },
        body: {
          dealership_id: '1',
          vehicle_id: '1',
          service_type_ids: ['1'],
          start_at: '2026-11-01T01:00:00.000Z',
          customer_notes: 'Regular maintenance',
        },
      };

      const next = jest.fn();
      middleware.use(req, {}, next);

      expect(next).toHaveBeenCalledTimes(1);

      // Query checks (both snake_case and camelCase available generically)
      expect(req.query.dealership_id).toBe('1');
      expect(req.query.dealershipId).toBe('1');
      expect(req.query.service_type_ids).toBe('1,2');
      expect(req.query.serviceTypeIds).toBe('1,2');
      expect(req.query.per_page).toBe(25);
      expect(req.query.perPage).toBe(25);
      expect(req.query.limit).toBe(25);

      // Params checks
      expect(req.params.dealership_id).toBe('10');
      expect(req.params.dealershipId).toBe('10');

      // Body checks (both snake_case and camelCase available, but only camelCase is enumerable for DTO validation)
      expect(req.body.dealership_id).toBe('1');
      expect(req.body.dealershipId).toBe('1');
      expect(req.body.vehicle_id).toBe('1');
      expect(req.body.vehicleId).toBe('1');
      expect(req.body.service_type_ids).toEqual(['1']);
      expect(req.body.serviceTypeIds).toEqual(['1']);
      expect(req.body.start_at).toBe('2026-11-01T01:00:00.000Z');
      expect(req.body.startAt).toBe('2026-11-01T01:00:00.000Z');
      expect(req.body.customer_notes).toBe('Regular maintenance');
      expect(req.body.customerNotes).toBe('Regular maintenance');

      // Enumerable keys check for strict NestJS ValidationPipe (forbidNonWhitelisted: true)
      expect(Object.keys(req.body)).toEqual([
        'dealershipId',
        'vehicleId',
        'serviceTypeIds',
        'startAt',
        'customerNotes',
      ]);
    });
  });
});
