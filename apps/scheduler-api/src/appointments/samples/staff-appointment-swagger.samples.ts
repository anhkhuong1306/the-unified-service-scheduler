export const STAFF_STREAM_SAMPLE = {
  type: 'APPOINTMENT_STATUS_CHANGED',
  data: {
    appointment_id: 'a1111111-1111-4111-8111-111111111111',
    dealership_id: '1',
    status: 'CHECKED_IN',
    version: 2,
  },
};

export const STAFF_SWAP_BODY_EXAMPLES = {
  standardSwap: {
    summary: 'Atomic Schedule Swap',
    value: {
      appointment_id_1: 'a1111111-1111-4111-8111-111111111111',
      appointment_id_2: 'b2222222-2222-4222-8222-222222222222',
      reason: 'Customer agreed schedule swap',
    },
  },
};

export const STAFF_SWAP_SUCCESS_SAMPLE = {
  appointment_1: {
    id: 'a1111111-1111-4111-8111-111111111111',
    start_at: '2026-11-03T10:00:00.000Z',
  },
  appointment_2: {
    id: 'b2222222-2222-4222-8222-222222222222',
    start_at: '2026-11-03T08:00:00.000Z',
  },
  swapped_at: '2026-11-02T15:00:00.000Z',
};

export const STAFF_REASSIGN_BODY_EXAMPLES = {
  reassignTech: {
    summary: 'Reassign Technician',
    value: { technician_id: '2', reason: 'Assigned to senior tech', version: 1 },
  },
  reassignBay: {
    summary: 'Reassign Bay',
    value: { service_bay_id: '3', reason: 'Bay 1 under maintenance', version: 1 },
  },
};

export const STAFF_RESCHEDULE_BODY_EXAMPLES = {
  earlyArrival: {
    summary: 'Reschedule Early Arrival',
    value: { start_at: '2026-11-03T07:30:00.000Z', notes: 'Early arrival bypass', version: 1 },
  },
};

export const STAFF_ACTION_BODY_EXAMPLES = {
  approve: {
    summary: 'Approve Appointment',
    value: { reason: 'Slot confirmed by workshop manager', version: 1 },
  },
  reject: {
    summary: 'Reject Appointment',
    value: { reason: 'Bay capacity exceeded', version: 1 },
  },
  checkIn: {
    summary: 'Check In Vehicle',
    value: { reason: 'Customer arrived at dealership reception', version: 1 },
  },
  start: {
    summary: 'Start Service',
    value: { notes: 'Vehicle moved to Bay 1, starting oil change', version: 2 },
  },
  complete: {
    summary: 'Complete Service',
    value: { notes: 'Service completed, checklist passed 100%', version: 3 },
  },
  noShow: {
    summary: 'Mark No Show',
    value: { reason: 'Customer did not arrive within 30m grace period', version: 1 },
  },
};
