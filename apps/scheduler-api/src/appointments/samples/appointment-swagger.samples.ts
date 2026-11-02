export const SAMPLE_APPOINTMENT_DATA = {
  id: 'a1111111-1111-4111-8111-111111111111',
  reference_code: 'APT-20261103-0001',
  status: 'CONFIRMED',
  dealership_id: '1',
  customer_id: '1',
  vehicle_id: '1',
  technician_id: '1',
  service_bay_id: '1',
  customer_name: 'John Doe',
  vehicle_plate: '51F-123.45',
  vehicle_label: '2022 Honda Civic',
  start_at: '2026-11-03T08:00:00.000Z',
  end_at: '2026-11-03T09:00:00.000Z',
  version: 1,
  customer_notes: 'Regular maintenance and brake check',
  services: [
    {
      id: '1',
      service_type_id: '1',
      code: 'OIL_FILTER',
      name: 'Standard Oil & Filter Service',
      duration_minutes: 45,
      price: '50.00',
    },
  ],
};

export const APPOINTMENT_AVAILABILITY_SUCCESS_SAMPLE = {
  dealership_id: '1',
  date: '2026-11-03',
  available_slots: [
    {
      start_at: '2026-11-03T08:00:00.000Z',
      end_at: '2026-11-03T08:30:00.000Z',
      is_available: true,
      available_technicians_count: 2,
    },
  ],
};

export const APPOINTMENT_SSE_STREAM_SAMPLE = {
  type: 'APPOINTMENT_CONFIRMED',
  data: {
    appointment_id: 'a1111111-1111-4111-8111-111111111111',
    status: 'CONFIRMED',
    version: 1,
  },
};

export const APPOINTMENT_CREATE_BODY_EXAMPLES = {
  standardBooking: {
    summary: 'Standard Maintenance Booking',
    value: {
      dealership_id: '1',
      vehicle_id: '1',
      service_type_ids: ['1'],
      start_at: '2026-11-03T08:00:00.000Z',
      technician_id: '1',
      customer_notes: 'Regular maintenance and brake check',
    },
  },
};

export const APPOINTMENT_UPDATE_BODY_EXAMPLES = {
  rescheduleOnly: {
    summary: 'Update Start Time',
    value: {
      start_at: '2026-11-03T09:30:00.000Z',
      version: 1,
    },
  },
  fullUpdate: {
    summary: 'Update Start Time and Notes',
    value: {
      start_at: '2026-11-03T09:30:00.000Z',
      customer_notes: 'Updated note: please inspect engine noise',
      version: 1,
    },
  },
};

export const APPOINTMENT_CANCEL_BODY_EXAMPLES = {
  withReason: {
    summary: 'Cancellation with Reason',
    value: {
      reason: 'Customer schedule conflict',
      version: 1,
    },
  },
};
