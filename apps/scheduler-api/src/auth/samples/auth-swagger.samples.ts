export const DEFAULT_MOCK_CUSTOMER_SUB = 'a1111111-1111-1111-1111-111111111111';
export const DEFAULT_MOCK_STAFF_SUB = 'b2222222-2222-2222-2222-222222222222';

export const SAMPLE_TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJyb2xlcyI6WyJjdXN0b21lciJdLCJ0ZW5hbnRfaWQiOjF9.mock_signature',
  token_type: 'Bearer',
  expires_in: 2592000,
  claims: {
    sub: 'a1111111-1111-1111-1111-111111111111',
    roles: ['customer'],
    tenant_id: 1,
  },
};

export const TOKEN_REQUEST_BODY_EXAMPLES = {
  customerToken: {
    summary: 'Customer Token Request',
    value: {
      sub: 'a1111111-1111-1111-1111-111111111111',
      role: 'customer',
      tenant_id: '1',
    },
  },
  staffToken: {
    summary: 'Staff Token Request',
    value: {
      sub: 's2222222-2222-2222-2222-222222222222',
      role: 'staff',
      tenant_id: '1',
    },
  },
};
