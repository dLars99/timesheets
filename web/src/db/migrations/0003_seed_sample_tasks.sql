INSERT OR IGNORE INTO tasks (
  id,
  project_id,
  description,
  task_date,
  total_ms,
  completed_at,
  ticket_number,
  created_at,
  updated_at
)
VALUES
  ('seed-task-001', 'support-tools', 'Investigate API timeout spike', '2026-03-24', 10800000, NULL, 'SUP-1012', '2026-03-24T09:00:00Z', '2026-03-24T12:00:00Z'),
  ('seed-task-002', 'tech-debt', 'Refactor timer pause state handling', '2026-03-24', 7200000, NULL, 'TD-88', '2026-03-24T12:15:00Z', '2026-03-24T14:15:00Z'),
  ('seed-task-003', 'sms-messages', 'Validate outbound SMS retry logs', '2026-03-24', 5400000, '2026-03-24T16:00:00Z', 'SMS-742', '2026-03-24T14:30:00Z', '2026-03-24T16:00:00Z'),
  ('seed-task-004', 'emaf-refunds', 'Audit failed refund queue entries', '2026-03-24', 9000000, '2026-03-24T18:30:00Z', 'EMAF-330', '2026-03-24T16:00:00Z', '2026-03-24T18:30:00Z'),
  ('seed-task-005', 'non-project', 'Weekly team sync and notes', '2026-03-24', 3600000, '2026-03-24T19:00:00Z', NULL, '2026-03-24T18:30:00Z', '2026-03-24T19:00:00Z'),

  ('seed-task-006', 'support-tools', 'Improve DB query index coverage', '2026-03-25', 12600000, NULL, 'SUP-1020', '2026-03-25T08:30:00Z', '2026-03-25T12:00:00Z'),
  ('seed-task-007', 'tech-debt', 'Clean up stale React effects', '2026-03-25', 6300000, NULL, 'TD-91', '2026-03-25T12:15:00Z', '2026-03-25T14:00:00Z'),
  ('seed-task-008', 'sms-messages', 'Investigate delivery status mismatch', '2026-03-25', 8100000, '2026-03-25T16:30:00Z', 'SMS-755', '2026-03-25T14:00:00Z', '2026-03-25T16:30:00Z'),
  ('seed-task-009', 'emaf-refunds', 'Map refund edge-case workflow', '2026-03-25', 4500000, '2026-03-25T18:00:00Z', 'EMAF-341', '2026-03-25T16:45:00Z', '2026-03-25T18:00:00Z'),
  ('seed-task-010', 'pto', 'Appointment block', '2026-03-25', 7200000, '2026-03-25T20:00:00Z', NULL, '2026-03-25T18:00:00Z', '2026-03-25T20:00:00Z'),

  ('seed-task-011', 'support-tools', 'Harden desktop persistence error handling', '2026-03-26', 14400000, NULL, 'SUP-1031', '2026-03-26T08:00:00Z', '2026-03-26T12:00:00Z'),
  ('seed-task-012', 'tech-debt', 'Update store action typing', '2026-03-26', 5400000, NULL, 'TD-97', '2026-03-26T12:15:00Z', '2026-03-26T13:45:00Z'),
  ('seed-task-013', 'sms-messages', 'Verify queue backfill script output', '2026-03-26', 6000000, '2026-03-26T15:30:00Z', 'SMS-761', '2026-03-26T13:50:00Z', '2026-03-26T15:30:00Z'),
  ('seed-task-014', 'emaf-refunds', 'Triaged duplicate refund events', '2026-03-26', 7800000, NULL, 'EMAF-349', '2026-03-26T15:45:00Z', '2026-03-26T17:55:00Z'),
  ('seed-task-015', 'non-project', 'Interview panel prep', '2026-03-26', 3000000, '2026-03-26T18:45:00Z', NULL, '2026-03-26T18:00:00Z', '2026-03-26T18:45:00Z'),

  ('seed-task-016', 'support-tools', 'Reproduce stale timer recovery issue', '2026-03-27', 9600000, NULL, 'SUP-1042', '2026-03-27T09:00:00Z', '2026-03-27T11:40:00Z'),
  ('seed-task-017', 'tech-debt', 'Consolidate date utility helpers', '2026-03-27', 4800000, '2026-03-27T13:15:00Z', 'TD-103', '2026-03-27T12:00:00Z', '2026-03-27T13:15:00Z'),
  ('seed-task-018', 'sms-messages', 'Run export regression pass', '2026-03-27', 6600000, NULL, 'SMS-770', '2026-03-27T13:30:00Z', '2026-03-27T15:20:00Z'),
  ('seed-task-019', 'emaf-refunds', 'Close out pending reconciliation notes', '2026-03-27', 3900000, '2026-03-27T16:30:00Z', 'EMAF-355', '2026-03-27T15:25:00Z', '2026-03-27T16:30:00Z'),
  ('seed-task-020', 'non-project', 'Sprint retrospective', '2026-03-27', 5400000, '2026-03-27T18:00:00Z', NULL, '2026-03-27T16:30:00Z', '2026-03-27T18:00:00Z');
