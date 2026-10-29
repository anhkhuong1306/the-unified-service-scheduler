import { RequestContextService } from '../context/request-context.service';
import {
  EVENT_SPAN,
  LogSpan,
  SpanLogPayload,
  SpanLogger,
} from '../decorators/log-span.decorator';
import { MASKED_PLACEHOLDER } from '../logging/sensitive-data-masker';

class SampleWorkshopAllocationService {
  @LogSpan()
  public pickTechnicianSync(input: {
    dealership_id: number;
    service_type_id: number;
    customer_name: string;
    vin: string;
    access_token: string;
  }): {
    technician_id: number;
    email: string;
    phone: string;
    status: string;
  } {
    return {
      technician_id: 7,
      email: 'tech7@workshop.local',
      phone: '+84912345678',
      status: 'ALLOCATED',
    };
  }

  @LogSpan()
  public async allocateResourcesAsync(input: {
    dealership_id: number;
    customer_name: string;
    vehicle_vin: string;
  }): Promise<{
    service_bay_id: number;
    technician_id: number;
    customer_email: string;
    status: string;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      service_bay_id: 3,
      technician_id: 5,
      customer_email: 'customer@example.com',
      status: 'CONFIRMED',
    };
  }
}

describe('@LogSpan() decorator & SpanLogger (§11.1 SYSTEM_DESIGN.md)', () => {
  const capturedSpans: SpanLogPayload[] = [];

  beforeEach(() => {
    capturedSpans.length = 0;
    RequestContextService.reset();
    SpanLogger.setSink((payload: SpanLogPayload) => {
      capturedSpans.push(payload);
    });
  });

  afterEach(() => {
    SpanLogger.setSink(null);
    RequestContextService.reset();
  });

  it('emits SPAN log with correlation_id from AsyncLocalStorage and masks sensitive input/output on synchronous methods', () => {
    const service = new SampleWorkshopAllocationService();

    RequestContextService.run({ correlationId: 'corr-span-sync-001' }, () => {
      const result = service.pickTechnicianSync({
        dealership_id: 1,
        service_type_id: 2,
        customer_name: 'Tran Thi B',
        vin: '1HGCM82633A004352',
        access_token: 'raw-jwt-secret',
      });

      // Return value to caller must remain unmasked
      expect(result.email).toBe('tech7@workshop.local');
      expect(result.technician_id).toBe(7);
    });

    expect(capturedSpans).toHaveLength(1);
    const span = capturedSpans[0];

    expect(span.event).toBe(EVENT_SPAN);
    expect(span.correlation_id).toBe('corr-span-sync-001');
    expect(span.class).toBe('SampleWorkshopAllocationService');
    expect(span.function).toBe('pickTechnicianSync');
    expect(typeof span.duration_ms).toBe('number');
    expect(span.duration_ms).toBeGreaterThanOrEqual(0);

    expect(span.input).toEqual({
      dealership_id: 1,
      service_type_id: 2,
      customer_name: 'T*** T*** B***',
      vin: '*************4352',
      access_token: MASKED_PLACEHOLDER,
    });

    const maskedOutput = span.output as Record<string, string | number>;
    expect(maskedOutput.technician_id).toBe(7);
    expect(maskedOutput.email).toBe('t***@workshop.local');
    expect(String(maskedOutput.phone).endsWith('678')).toBe(true);
    expect(maskedOutput.status).toBe('ALLOCATED');
  });

  it('emits SPAN log with correlation_id and masked input/output on async (Promise) methods', async () => {
    const service = new SampleWorkshopAllocationService();

    await RequestContextService.run(
      { correlationId: 'corr-span-async-002' },
      async () => {
        const result = await service.allocateResourcesAsync({
          dealership_id: 2,
          customer_name: 'Le Van C',
          vehicle_vin: '5YJSA1E26MF123456',
        });

        expect(result.service_bay_id).toBe(3);
        expect(result.customer_email).toBe('customer@example.com');
      },
    );

    expect(capturedSpans).toHaveLength(1);
    const span = capturedSpans[0];

    expect(span.event).toBe(EVENT_SPAN);
    expect(span.correlation_id).toBe('corr-span-async-002');
    expect(span.class).toBe('SampleWorkshopAllocationService');
    expect(span.function).toBe('allocateResourcesAsync');
    expect(typeof span.duration_ms).toBe('number');
    expect(span.duration_ms).toBeGreaterThan(0);

    expect(span.input).toEqual({
      dealership_id: 2,
      customer_name: 'L*** V*** C***',
      vehicle_vin: '*************3456',
    });

    expect(span.output).toEqual({
      service_bay_id: 3,
      technician_id: 5,
      customer_email: 'c***@example.com',
      status: 'CONFIRMED',
    });
  });
});
