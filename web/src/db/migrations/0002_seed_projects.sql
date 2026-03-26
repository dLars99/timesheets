INSERT INTO projects (id, name, requires_ticket, is_user_defined, created_at)
VALUES
  ('pto', 'PTO', 0, 0, CURRENT_TIMESTAMP),
  ('non-project', 'Non-project', 0, 0, CURRENT_TIMESTAMP),
  ('emaf-refunds', 'EMAF Refunds', 1, 0, CURRENT_TIMESTAMP),
  ('sms-messages', 'SMS Messages', 1, 0, CURRENT_TIMESTAMP),
  ('support-tools', 'Support Tools', 1, 0, CURRENT_TIMESTAMP),
  ('tech-debt', 'Tech Debt', 1, 0, CURRENT_TIMESTAMP);
