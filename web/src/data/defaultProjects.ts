import type { Project } from '../types/timesheet'

const now = new Date().toISOString()

export const DEFAULT_PROJECTS: Project[] = [
  {
    id: 'pto',
    name: 'PTO',
    requiresTicket: false,
    isUserDefined: false,
    createdAt: now,
  },
  {
    id: 'non-project',
    name: 'Non-project',
    requiresTicket: false,
    isUserDefined: false,
    createdAt: now,
  },
  {
    id: 'emaf-refunds',
    name: 'EMAF Refunds',
    requiresTicket: true,
    isUserDefined: false,
    createdAt: now,
  },
  {
    id: 'sms-messages',
    name: 'SMS Messages',
    requiresTicket: true,
    isUserDefined: false,
    createdAt: now,
  },
  {
    id: 'support-tools',
    name: 'Support Tools',
    requiresTicket: true,
    isUserDefined: false,
    createdAt: now,
  },
  {
    id: 'tech-debt',
    name: 'Tech Debt',
    requiresTicket: true,
    isUserDefined: false,
    createdAt: now,
  },
]
