import { Injectable, NestMiddleware } from '@nestjs/common';
import { transformKeysToCamelCase } from '../utils/camel-case.util';

/**
 * Normalizes query parameters, route parameters, and request body from snake_case to camelCase
 * across all APIs for seamless NestJS DTO mapping, while preventing forbidNonWhitelisted validation errors.
 */
@Injectable()
export class QueryParamNormalizerMiddleware implements NestMiddleware {
  public use(
    req: {
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
    },
    res: unknown,
    next: () => void,
  ): void {
    // 1. Normalize query parameters (convert all snake_case keys to camelCase)
    if (req.query && typeof req.query === 'object') {
      const camelQuery = transformKeysToCamelCase<Record<string, unknown>>(req.query);
      req.query = { ...req.query, ...camelQuery };

      // Dealership alias compatibility
      if (req.query['dealerShipId'] !== undefined && req.query['dealershipId'] === undefined) {
        req.query['dealershipId'] = req.query['dealerShipId'];
      }
      if (req.query['dealer_ship_id'] !== undefined && req.query['dealership_id'] === undefined) {
        req.query['dealership_id'] = req.query['dealer_ship_id'];
      }

      // Pagination semantic alias: per_page / perPage -> limit
      if (req.query['perPage'] !== undefined && req.query['limit'] === undefined) {
        req.query['limit'] = req.query['perPage'];
      }
      if (req.query['per_page'] !== undefined && req.query['limit'] === undefined) {
        req.query['limit'] = req.query['per_page'];
      }
    }

    // 2. Normalize route parameters
    if (req.params && typeof req.params === 'object' && Object.keys(req.params).length > 0) {
      const camelParams = transformKeysToCamelCase<Record<string, unknown>>(req.params);
      req.params = { ...req.params, ...camelParams };
    }

    // 3. Normalize request body
    if (req.body && typeof req.body === 'object') {
      req.body = transformKeysToCamelCase<Record<string, unknown>>(req.body);
    }

    next();
  }
}
