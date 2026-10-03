// Synthetic demo world. Every name here is fictional.
export const USERS = [
  { id: 'u-priya', username: 'priya', displayName: 'Priya Shah', role: 'manager', managerId: null },
  { id: 'u-jordan', username: 'jordan', displayName: 'Jordan Lee', role: 'employee', managerId: 'u-priya' },
  { id: 'u-sam', username: 'sam', displayName: 'Sam Rivera', role: 'employee', managerId: 'u-priya' },
  { id: 'u-marcus', username: 'marcus', displayName: 'Marcus Cole', role: 'billing', managerId: null },
  { id: 'u-dana', username: 'dana', displayName: 'Dana Ortiz', role: 'admin', managerId: null },
];
export const PTO_BALANCES = { 'u-jordan': 40, 'u-sam': 24, 'u-priya': 64, 'u-marcus': 32 };
export const PATIENTS = [
  ['P-01', 'Avery Testpatient'], ['P-02', 'Blake Sample'], ['P-03', 'Casey Placeholder'],
  ['P-04', 'Drew Fictional'], ['P-05', 'Emery Synthetic'],
];
// [id, patient, payer, amountCents, serviceDate, status, denialCode, denialReason, assignedTo]
export const CLAIMS = [
  ['CLM-1001', 'P-01', 'Payer A', 120000, '2026-08-04', 'PAID', null, null, 'u-marcus'],
  ['CLM-1002', 'P-02', 'Payer B', 86000, '2026-08-11', 'SUBMITTED', null, null, 'u-marcus'],
  ['CLM-1003', 'P-03', 'Payer B', 214000, '2026-08-19', 'DENIED', 'CO-16', 'Claim lacked required information (missing referring provider NPI).', 'u-marcus'],
  ['CLM-1004', 'P-01', 'Payer A', 325000, '2026-08-26', 'DENIED', 'CO-197', 'Precertification/authorization absent for skilled home-health visits.', 'u-marcus'],
  ['CLM-1005', 'P-04', 'Payer A', 64000, '2026-09-02', 'PENDING_INFO', null, null, 'u-marcus'],
  ['CLM-1006', 'P-04', 'Payer A', 780000, '2026-09-09', 'APPEALED', 'CO-197', 'Precertification/authorization absent.', 'u-marcus'],
  ['CLM-1007', 'P-05', 'Payer B', 195000, '2026-09-15', 'DENIED', 'CO-16', 'Claim lacked required information.', null],
  ['CLM-1008', 'P-05', 'Payer B', 41000, '2026-09-22', 'SUBMITTED', null, null, 'u-marcus'],
];
