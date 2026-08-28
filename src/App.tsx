import { MotionConfig } from 'framer-motion'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { StoreProvider, useStore } from './lib/store.js'
import { AppShell } from './components/layout/AppShell.js'
import { BootGate } from './components/layout/BootGate.js'
import { can, roleLabel, type Permission } from './lib/rbac.js'
import { Button, EmptyState } from './components/ui'
import Dashboard from './pages/Dashboard.js'
import Properties from './pages/Properties.js'
import PropertyDetail from './pages/PropertyDetail.js'
import Availability from './pages/Availability.js'
import Clients from './pages/Clients.js'
import ClientDetail from './pages/ClientDetail.js'
import Bookings from './pages/Bookings.js'
import Payments from './pages/Payments.js'
import Maintenance from './pages/Maintenance.js'
import Notifications from './pages/Notifications.js'
import Reports from './pages/Reports.js'
import Settings from './pages/Settings.js'
import Team from './pages/Team.js'
import Tenants from './pages/Tenants.js'
import Admin from './pages/Admin.js'
import Portal from './pages/Portal.js'

function Guard({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { state } = useStore()
  const navigate = useNavigate()
  if (can(state.role, permission)) return <>{children}</>
  return (
    <div className="card mx-auto max-w-xl">
      <EmptyState
        icon={<ShieldAlert size={22} />}
        title="Not available for this role"
        body={`This section is outside what a ${roleLabel(state.role).toLowerCase()} can reach. The server refuses it too, so this is the same answer either way.`}
        action={<Button variant="secondary" onClick={() => navigate(-1)}>Go back</Button>}
      />
    </div>
  )
}

/**
 * The app, or the portal.
 *
 * A tenant login is not a member of staff with fewer buttons: they open
 * this a few times a year to see what they owe and when their stay ends,
 * and everything the operator app is built around — the portfolio, the
 * calendar, the maintenance board — is somebody else's business. So they
 * get their own page rather than a narrowed version of this one, which
 * is also why there is no router around it: there is nowhere to go.
 */
function Surface() {
  const { state } = useStore()
  if (state.member?.role === 'tenant') return <Portal />
  return (
    /* Hash routing, which survives a refresh and supports deep links
       without the host having to rewrite unknown paths. */
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="availability" element={<Guard permission="view:calendar"><Availability /></Guard>} />
          <Route path="properties" element={<Guard permission="view:properties"><Properties /></Guard>} />
          <Route path="properties/:id" element={<Guard permission="view:properties"><PropertyDetail /></Guard>} />
          <Route path="bookings" element={<Guard permission="view:bookings"><Bookings /></Guard>} />
          <Route path="clients" element={<Guard permission="view:clients"><Clients /></Guard>} />
          <Route path="clients/:id" element={<Guard permission="view:clients"><ClientDetail /></Guard>} />
          <Route path="payments" element={<Guard permission="view:payments"><Payments /></Guard>} />
          <Route path="maintenance" element={<Guard permission="view:maintenance"><Maintenance /></Guard>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="reports" element={<Guard permission="view:reports"><Reports /></Guard>} />
          <Route path="team" element={<Guard permission="manage:team"><Team /></Guard>} />
          <Route path="tenants" element={<Guard permission="view:clients"><Tenants /></Guard>} />
          <Route path="admin" element={<Admin />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <MotionConfig reducedMotion="user">
        <BootGate>
          <Surface />
        </BootGate>
      </MotionConfig>
    </StoreProvider>
  )
}
