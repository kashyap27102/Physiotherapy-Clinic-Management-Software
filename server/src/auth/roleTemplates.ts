import { PERMISSION_KEYS, type PermissionKey } from './permissionKeys.js'

/**
 * Default permissions given to every new clinic's roles (BR-USR-7), from the PRD section 16 matrix.
 * The owner can change the receptionist and physiotherapist sets later (USR-002).
 */
export const ROLE_TEMPLATES: Record<
  'owner' | 'receptionist' | 'physiotherapist',
  { name: string; permissions: readonly PermissionKey[] }
> = {
  owner: {
    name: 'Owner',
    // Everything a clinic can do; platform.admin belongs only to the super-admin.
    permissions: PERMISSION_KEYS.filter((key) => key !== 'platform.admin'),
  },
  receptionist: {
    name: 'Receptionist',
    permissions: [
      'patient.register',
      'patient.edit',
      'patient.view',
      'clinical.view',
      'visit.mark',
      'ledger.view',
      'payment.record',
      'document.issue',
    ],
  },
  physiotherapist: {
    name: 'Physiotherapist',
    permissions: ['patient.view', 'clinical.view', 'clinical.edit', 'episode.manage', 'visit.mark'],
  },
}
