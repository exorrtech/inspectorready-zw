-- InspectorReady ZW: demo seed data
-- Every organisation, person and detail here is fictional.
-- Demo login: demo@inspectorready.co.zw / DemoPass123!

DELETE FROM orgs WHERE name = 'Aeon Learning Centre (Demo)';

INSERT INTO orgs (name, registered_name, reg_number, sector, contact_email)
VALUES (
  'Aeon Learning Centre (Demo)',
  'Aeon Learning Trust (Demo)',
  'DEMO/PBO/0001',
  'School',
  'admin@aeon-demo.example'
);

INSERT INTO users (org_id, email, password_hash, full_name, role)
SELECT o.id, 'demo@inspectorready.co.zw',
       '$2b$12$dQ/wke0rwkD4Bwx.uu.myeyHcwqFaQ/zlaTriKNYUObj.WZOw16ry',
       'Demo Administrator', 'owner'
FROM orgs o
WHERE o.name = 'Aeon Learning Centre (Demo)';

INSERT INTO compliance_items (org_id, code, title, status, evidence_note, evidence_date)
SELECT o.id, v.code, v.title, v.status, v.evidence_note, v.evidence_date::date
FROM orgs o
CROSS JOIN (VALUES
  ('licence', 'Data Controller licence obtained', 'done',
   'Data Controller licence DC-2026-0042, Tier 1, expires 31 March 2027.', '2026-04-01'),
  ('dpo', 'DPO appointed and notified to POTRAZ', 'done',
   'Mrs T. Moyo appointed; Form DP2 submitted 12 April 2026.', '2026-04-12'),
  ('ropa', 'Record of processing activities maintained', 'done',
   'Generated from this register on 10 November 2026.', '2026-11-10'),
  ('privacy_notice', 'Privacy notice published', 'done',
   'Published at https://aeon-demo.example/privacy', '2026-05-02'),
  ('training', 'Staff data-protection training completed', 'in_progress',
   'Whole-school session scheduled for 20 November 2026.', NULL),
  ('breach_register', 'Breach register maintained', 'in_progress',
   'Template adopted; last reviewed 1 October 2026.', '2026-10-01'),
  ('dsr_register', 'Data subject request register maintained', 'missing',
   NULL, NULL),
  ('cross_border_auth', 'Cross-border transfer authorisation obtained', 'in_progress',
   'Payroll data hosted in South Africa; POTRAZ authorisation not yet applied for.', NULL)
) AS v(code, title, status, evidence_note, evidence_date)
WHERE o.name = 'Aeon Learning Centre (Demo)';

INSERT INTO processing_activities (
  org_id, data_subject_category, data_description, is_sensitive, purpose, lawful_basis,
  recipients, storage_location, cross_border, retention, security_measures
)
SELECT o.id, v.data_subject_category, v.data_description, v.is_sensitive, v.purpose,
       v.lawful_basis, v.recipients, v.storage_location, v.cross_border,
       v.retention, v.security_measures
FROM orgs o
CROSS JOIN (VALUES
  ('Learners and guardians',
   'Full name, date of birth, national ID, guardian contact details, medical notes',
   true, 'Enrolment and learner administration', 'contract',
   'Teaching staff; Ministry of Primary and Secondary Education',
   'Paper files in locked office; school server', false,
   '7 years after the learner leaves',
   'Locked cabinets; role-based access; nightly backups'),
  ('Employees',
   'Name, national ID, bank details, employment history, medical aid details',
   true, 'HR and payroll administration', 'contract',
   'Payroll provider (DemoPay, South Africa); ZIMRA',
   'Cloud payroll (DemoPay)', true,
   '7 years after employment ends',
   'Password-protected payroll; MFA; access limited to HR'),
  ('Donors',
   'Name, contact details, donation history',
   false, 'Fundraising and donor relations', 'consent',
   'Committee members only',
   'Spreadsheet on school laptop', false,
   '3 years',
   'Password-protected spreadsheet; restricted folder'),
  ('Suppliers',
   'Company name, contact person, banking details',
   false, 'Procurement and payment', 'contract',
   'Bank; auditor',
   'Paper files and accounting software', false,
   '6 years',
   'Locked office; accounting software login')
) AS v(data_subject_category, data_description, is_sensitive, purpose, lawful_basis,
       recipients, storage_location, cross_border, retention, security_measures)
WHERE o.name = 'Aeon Learning Centre (Demo)';
