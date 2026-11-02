export const SAMPLE_DEALERSHIP = {
  id: '1',
  code: 'DEALER-01',
  name: 'Central Workshop Saigon',
  address: '123 Nguyen Trai, District 1, Ho Chi Minh City',
  phone: '0901234567',
  is_active: true,
};

export const SAMPLE_TECHNICIAN = {
  id: '1',
  code: 'TECH-01',
  name: 'Tran Van Bao',
  dealership_id: '1',
  is_active: true,
};

export const DEALERSHIP_SLOTS_SUCCESS_SAMPLE = {
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
