// Renders every view with representative data and exits non-zero on the first failure.
const ejs = require('ejs');
const path = require('path');

const VIEW_DIR = path.join(__dirname, '..', 'views');

const base = {
  title: 'Smoke',
  user: { id: 1, email: 'demo@inspectorready.co.zw', full_name: 'Demo Administrator', role: 'owner', org_id: 2 },
  org: {
    id: 2,
    name: 'Sunrise Learning Centre (Demo)',
    registered_name: 'Sunrise Learning Centre Trust (Demo)',
    reg_number: 'DEMO/PBO/0001',
    sector: 'School',
    contact_email: 'admin@sunrise-demo.example',
  },
  isDemo: true,
  flash: { type: 'success', message: 'Saved.' },
  csrfToken: 'smoke-token',
  path: '/dashboard',
  SECTORS: ['School', 'SME'],
  LAWFUL_BASES: [
    { value: 'consent', label: 'Consent' },
    { value: 'contract', label: 'Contract' },
  ],
  stats: { done: 4, total: 8, score: 50 },
  items: [
    { code: 'licence', title: 'Data Controller licence obtained', status: 'done', evidence_note: 'Licence DC-2026-0042', evidence_date: '2026-04-01' },
    { code: 'dpo', title: 'DPO appointed and notified to POTRAZ', status: 'missing', evidence_note: null, evidence_date: null },
  ],
  activities: [
    { id: 1, data_subject_category: 'Learners and guardians', purpose: 'Enrolment', storage_location: 'Paper files', cross_border: true, is_sensitive: true },
  ],
  generatedAt: '12 November 2026 at 10:00',
};

const jobs = [
  ['landing.ejs', { ...base, title: 'InspectorReady ZW', user: null, org: null, flash: null }],
  ['login.ejs', { ...base, title: 'Log in', user: null, org: null, flash: null, error: null, email: '' }],
  ['signup.ejs', { ...base, title: 'Create account', user: null, org: null, flash: null, error: null, form: {} }],
  ['dashboard.ejs', { ...base, title: 'Dashboard' }],
  ['activities.ejs', { ...base, title: 'Processing activities' }],
  ['activity-form.ejs', { ...base, title: 'Add processing activity', activity: {}, errors: {}, isEdit: false, action: '/activities' }],
  ['activity-form.ejs', { ...base, title: 'Edit processing activity', activity: { data_subject_category: 'Learners', lawful_basis: 'consent', is_sensitive: true }, errors: { lawful_basis: 'Choose a lawful basis' }, isEdit: true, action: '/activities/1' }],
  ['export.ejs', { ...base, title: 'Export pack' }],
  ['error.ejs', { ...base, title: 'Page not found', message: 'That page does not exist.' }],
];

let failures = 0;
let pending = jobs.length;
for (const [file, data] of jobs) {
  ejs.renderFile(path.join(VIEW_DIR, file), data, {}, (err) => {
    if (err) {
      failures += 1;
      console.error('FAIL', file, '-', err.message.split('\n')[0]);
    } else {
      console.log('OK  ', file);
    }
    if (--pending === 0) {
      if (failures) {
        console.error(`${failures} template(s) failed`);
        process.exit(1);
      }
      console.log(`All ${jobs.length} templates render`);
    }
  });
}
