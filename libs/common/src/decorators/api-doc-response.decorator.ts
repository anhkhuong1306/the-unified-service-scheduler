import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';

const MOCK_CORRELATION_ID = '8e733bef-4723-42bc-a9ff-f6dfc9f0bbda';

export const STANDARD_ERROR_SAMPLES: Record<
  number,
  { statusCode: number; errorCode: string; message: string; data: unknown; description: string }
> = {
  400: {
    statusCode: 400,
    errorCode: 'VALIDATION_FAILED',
    message: 'The given data failed validation.',
    data: {
      errors: ['dealership_id is required', 'start_at must be a valid ISO 8601 timestamp'],
    },
    description: 'Bad Request / Validation Failure',
  },
  401: {
    statusCode: 401,
    errorCode: 'UNAUTHORIZED',
    message: 'Missing authentication token or credentials',
    data: null,
    description: 'Missing or Invalid Bearer Token',
  },
  403: {
    statusCode: 403,
    errorCode: 'FORBIDDEN',
    message: 'Actor lacks sufficient permissions for this operation',
    data: null,
    description: 'Access Forbidden / Insufficient Role',
  },
  404: {
    statusCode: 404,
    errorCode: 'RESOURCE_NOT_FOUND',
    message: 'The requested resource was not found',
    data: null,
    description: 'Resource Not Found',
  },
  409: {
    statusCode: 409,
    errorCode: 'RESOURCE_CONFLICT',
    message: 'Conflict detected: slot or resource already occupied / optimistic lock mismatch',
    data: null,
    description: 'Conflict / Concurrency / Exclusion Lock Violation',
  },
  500: {
    statusCode: 500,
    errorCode: 'INTERNAL_ERROR',
    message: 'An unexpected internal error occurred.',
    data: null,
    description: 'Internal Server Error',
  },
  503: {
    statusCode: 503,
    errorCode: 'SERVICE_UNAVAILABLE',
    message: 'Service is not ready or database/SSO is unreachable',
    data: null,
    description: 'Service Unavailable / Degraded Health',
  },
};

/**
 * Builds a standard OpenAPI response object adhering to the unified envelope.
 */
export function buildEnvelopeExample(
  statusCode: number,
  data: unknown,
  message: string = 'OK',
  errorCode: string | null = null,
  meta: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status_code: statusCode,
    error_code: errorCode,
    data,
    message,
    meta: {
      correlation_id: MOCK_CORRELATION_ID,
      ...meta,
    },
  };
}

/**
 * Common composite decorator for 2xx Success Envelope responses with concrete JSON samples.
 */
export function ApiDocSuccess(options: {
  status?: number;
  description?: string;
  example?: unknown;
}): MethodDecorator {
  const status = options.status ?? 200;
  const description = options.description ?? (status === 201 ? 'Created successfully' : 'Request succeeded');
  const examplePayload = buildEnvelopeExample(
    status,
    options.example ?? {},
    status === 201 ? 'Created successfully' : 'OK',
  );

  return SwaggerResponse({
    status,
    description,
    content: {
      'application/json': {
        example: examplePayload,
      },
    },
  });
}

/**
 * Common composite decorator for paginated 200 OK list responses with pagination metadata and items sample.
 */
export function ApiDocPaginated(options: {
  description?: string;
  exampleItem?: unknown;
  exampleItems?: unknown[];
  total?: number;
}): MethodDecorator {
  const items = options.exampleItems ?? (options.exampleItem ? [options.exampleItem] : []);
  const total = options.total ?? items.length;

  const examplePayload = buildEnvelopeExample(
    200,
    items,
    'OK',
    null,
    {
      page: 1,
      limit: 10,
      per_page: 10,
      total,
      total_pages: Math.max(Math.ceil(total / 10), 1),
      has_next: false,
      has_prev: false,
    },
  );

  return SwaggerResponse({
    status: 200,
    description: options.description ?? 'List returned with offset pagination',
    content: {
      'application/json': {
        example: examplePayload,
      },
    },
  });
}

/**
 * Common composite decorator for error responses (400, 401, 403, 404, 409, 500).
 * Generates exact standardized error envelope samples with status code, error code, and correlation ID.
 */
export function ApiDocErrors(statusCodes: number[] = [400, 401, 500]): MethodDecorator {
  const decorators = statusCodes.map((code) => {
    const errorDef = STANDARD_ERROR_SAMPLES[code] ?? {
      statusCode: code,
      errorCode: `HTTP_${code}`,
      message: `HTTP Error ${code}`,
      data: null,
      description: `Error ${code}`,
    };

    const errorPayload = buildEnvelopeExample(
      errorDef.statusCode,
      errorDef.data,
      errorDef.message,
      errorDef.errorCode,
    );

    return SwaggerResponse({
      status: code,
      description: errorDef.description,
      content: {
        'application/json': {
          example: errorPayload,
        },
      },
    });
  });

  return applyDecorators(...decorators);
}

/**
 * High-level all-in-one endpoint documentation decorator uniting Operation, Success/Paginated sample, and Errors.
 */
export function ApiDocEndpoint(options: {
  summary: string;
  description?: string;
  success?: {
    status?: number;
    description?: string;
    example?: unknown;
  };
  paginated?: {
    description?: string;
    exampleItem?: unknown;
    exampleItems?: unknown[];
    total?: number;
  };
  errors?: number[];
}): MethodDecorator {
  const decorators: MethodDecorator[] = [
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
  ];

  if (options.success) {
    decorators.push(ApiDocSuccess(options.success));
  } else if (options.paginated) {
    decorators.push(ApiDocPaginated(options.paginated));
  } else {
    decorators.push(ApiDocSuccess({ status: 200 }));
  }

  const errorCodes = options.errors ?? [400, 401, 500];
  decorators.push(ApiDocErrors(errorCodes));

  return applyDecorators(...decorators);
}
