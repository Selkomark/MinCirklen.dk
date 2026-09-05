import { useTranslation } from 'react-i18next'
import { Spinner } from '../../components/Spinner'
import { Tabs, TabList, Tab, TabPanel } from '../../components/Tabs'
import { ErrorPage } from '../ErrorPage'
import { useDocumentTitle } from '../../useDocumentTitle'
import { hasAccess, useAccess } from './useAccess'
import { RolesTab } from './RolesTab'
import { UsersTab } from './UsersTab'
import { ReviewQueueTab } from './ReviewQueueTab'

// Reachable at /manage by any regular, verified user (App.tsx's Shell
// gates on the same authStatus === 'verified' every other real feature
// uses) — the actual boundary here is RBAC, checked below via
// rbac.myAccess and, independently and for real, by hasPermission() on
// every procedure each tab calls.
export function ManagePage() {
  const { t } = useTranslation('errors')
  useDocumentTitle('Manage — MinCirklen')
  const status = useAccess()

  if (status.kind === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
        <Spinner size={24} />
      </div>
    )
  }

  if (status.kind === 'error') {
    return <ErrorPage code={500} title={t('boundary.title')} message={t('boundary.message')} />
  }

  const { access } = status
  const canAccess = hasAccess(access, 'admin.access')

  // This check is UX only — every tab's actual data/actions are
  // independently re-gated server-side by hasPermission() regardless of
  // what renders here.
  if (!canAccess) {
    return <ErrorPage code={403} title={t('forbidden.title')} message={t('forbidden.message')} />
  }

  const canRoles = hasAccess(access, 'roles.read')
  const canUsers = hasAccess(access, 'users.read')
  const canReview = hasAccess(access, 'moderation_events.review')

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)' }}>
        Manage
      </h1>

      <Tabs>
        <TabList aria-label="Manage sections">
          {canReview && <Tab id="review">Review queue</Tab>}
          {canRoles && <Tab id="roles">Roles</Tab>}
          {canUsers && <Tab id="users">Users</Tab>}
        </TabList>
        {canReview && (
          <TabPanel id="review">
            <ReviewQueueTab />
          </TabPanel>
        )}
        {canRoles && (
          <TabPanel id="roles">
            <RolesTab />
          </TabPanel>
        )}
        {canUsers && (
          <TabPanel id="users">
            <UsersTab />
          </TabPanel>
        )}
      </Tabs>
    </div>
  )
}
