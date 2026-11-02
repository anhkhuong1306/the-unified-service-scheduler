export const HEALTH_LIVE_SAMPLE = {
  status: 'ok',
  service: 'scheduler-api',
};

export const HEALTH_READY_SAMPLE = {
  status: 'ready',
  checks: {
    database: 'up',
    sso: 'mock_enabled',
  },
};
