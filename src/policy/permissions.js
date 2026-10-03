export const ROLE_PERMISSIONS = Object.freeze({
  employee: ['chat', 'pto:read:self', 'pto:request:self'],
  manager: ['chat', 'pto:read:self', 'pto:request:self', 'pto:read:reports', 'pto:decide:reports'],
  billing: ['chat', 'pto:read:self', 'pto:request:self', 'claims:read:assigned', 'billing:task:create', 'claims:transition'],
  admin: ['chat', 'audit:read', 'demo:reset', 'lab:run'],
});
// Fail closed: unknown roles and missing users get nothing.
export const can = (user, permission) => Boolean(user && Object.hasOwn(ROLE_PERMISSIONS, user.role) && ROLE_PERMISSIONS[user.role].includes(permission));
// What a request *kind* requires. Policy questions are open to all; personal data and actions are not.
export const INTENT_PERMISSION = Object.freeze({ billing: 'claims:read:assigned', pto_request: 'pto:request:self', pto_question: 'chat', general: 'chat' });
export const ROLE_COLLECTIONS = Object.freeze({ employee: ['careops-hr'], manager: ['careops-hr'], billing: ['careops-hr', 'careops-billing'], admin: ['careops-hr'] });
