import { randomUUID } from 'node:crypto';
export const newId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
