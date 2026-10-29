import {
  MASKED_PLACEHOLDER,
  SensitiveDataMasker,
} from '../logging/sensitive-data-masker';

describe('SensitiveDataMasker (§11.1 SYSTEM_DESIGN.md)', () => {
  it('masks top-level and deeply nested credentials and PII fields while preserving business fields', () => {
    const rawPayload = {
      password: 'SuperSecretPassword!123',
      client_secret: 'scheduler-web-secret-xyz',
      access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9',
      refresh_token: 'rt_9988776655',
      email: 'john.doe@example.com',
      phone: '+84901234789',
      vin: '1HGCM82633A004352',
      customer_name: 'John Doe',
      dealership_id: 1,
      service_type_id: 2,
      start_at: '2026-11-01T09:00:00Z',
      status: 'CONFIRMED',
      nested: {
        appointment: {
          customer_name: 'Nguyen Van A',
          vehicle_vin: '5YJSA1E26MF123456',
          customer_email: 'nguyenvana@dealer.vn',
          customer_phone: '0987654321',
          refresh_token: 'nested-refresh-token',
          dealership_id: 10,
          service_type_id: 4,
          start_at: '2026-11-02T14:30:00Z',
          status: 'PENDING',
        },
        items: [
          {
            vin: 'WBA3A5C51DF129876',
            customer_name: 'Alice Smith',
            status: 'CHECKED_IN',
          },
        ],
      },
    };

    const masked = SensitiveDataMasker.maskData(rawPayload);

    // Full mask credentials
    expect(masked.password).toBe(MASKED_PLACEHOLDER);
    expect(masked.client_secret).toBe(MASKED_PLACEHOLDER);
    expect(masked.access_token).toBe(MASKED_PLACEHOLDER);
    expect(masked.authorization).toBe(MASKED_PLACEHOLDER);
    expect(masked.refresh_token).toBe(MASKED_PLACEHOLDER);

    // Partial mask PII & VIN at top level
    expect(masked.email).toBe('j***@example.com');
    expect(masked.phone.endsWith('789')).toBe(true);
    expect(masked.phone).not.toContain('+84901234');
    expect(masked.vin).toBe('*************4352');
    expect(masked.customer_name).toBe('J*** D***');

    // Business fields untouched at top level
    expect(masked.dealership_id).toBe(1);
    expect(masked.service_type_id).toBe(2);
    expect(masked.start_at).toBe('2026-11-01T09:00:00Z');
    expect(masked.status).toBe('CONFIRMED');

    // Deeply nested object & array masking
    const nestedApt = masked.nested.appointment;
    expect(nestedApt.customer_name).toBe('N*** V*** A***');
    expect(nestedApt.vehicle_vin).toBe('*************3456');
    expect(nestedApt.customer_email).toBe('n***@dealer.vn');
    expect(nestedApt.customer_phone.endsWith('321')).toBe(true);
    expect(nestedApt.customer_phone).not.toContain('0987654');
    expect(nestedApt.refresh_token).toBe(MASKED_PLACEHOLDER);
    expect(nestedApt.dealership_id).toBe(10);
    expect(nestedApt.service_type_id).toBe(4);
    expect(nestedApt.start_at).toBe('2026-11-02T14:30:00Z');
    expect(nestedApt.status).toBe('PENDING');

    expect(masked.nested.items[0]).toEqual({
      vin: '*************9876',
      customer_name: 'A*** S***',
      status: 'CHECKED_IN',
    });
  });

  it('masks sensitive keys inside JSON-encoded strings and safely handles circular references (Rule CI40)', () => {
    const jsonString = JSON.stringify({
      access_token: 'secret-jwt-token',
      customer_name: 'Bob Builder',
      vin: 'JM1BL1SF7A1239999',
      dealership_id: 2,
      status: 'CONFIRMED',
    });

    const maskedJson = SensitiveDataMasker.maskData(jsonString);
    const parsed = JSON.parse(maskedJson) as Record<string, unknown>;

    expect(parsed.access_token).toBe(MASKED_PLACEHOLDER);
    expect(parsed.customer_name).toBe('B*** B***');
    expect(parsed.vin).toBe('*************9999');
    expect(parsed.dealership_id).toBe(2);
    expect(parsed.status).toBe('CONFIRMED');

    // Verify circular reference guard prevents stack overflow
    const circularObj: Record<string, unknown> = {
      email: 'circular@example.com',
      status: 'CONFIRMED',
    };
    circularObj.self = circularObj;

    const maskedCircular = SensitiveDataMasker.maskData(circularObj);
    expect(maskedCircular.email).toBe('c***@example.com');
    expect(maskedCircular.status).toBe('CONFIRMED');
    expect(maskedCircular.self).toBe('[Circular]');
  });
});
