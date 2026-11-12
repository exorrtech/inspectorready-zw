const CHECKLIST_ITEMS = [
  { code: 'licence', title: 'Data Controller licence obtained' },
  { code: 'dpo', title: 'DPO appointed and notified to POTRAZ' },
  { code: 'ropa', title: 'Record of processing activities maintained' },
  { code: 'privacy_notice', title: 'Privacy notice published' },
  { code: 'training', title: 'Staff data-protection training completed' },
  { code: 'breach_register', title: 'Breach register maintained' },
  { code: 'dsr_register', title: 'Data subject request register maintained' },
  { code: 'cross_border_auth', title: 'Cross-border transfer authorisation obtained' },
];

const LAWFUL_BASES = [
  { value: 'consent', label: 'Consent' },
  { value: 'contract', label: 'Contract' },
  { value: 'legal_obligation', label: 'Legal obligation' },
  { value: 'legitimate_interest', label: 'Legitimate interest' },
];

const SECTORS = [
  'School',
  'Clinic / healthcare',
  'NGO / PVO',
  'Church / religious organisation',
  'SME',
  'Other',
];

module.exports = { CHECKLIST_ITEMS, LAWFUL_BASES, SECTORS };
