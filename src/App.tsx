import { MotionConfig } from 'framer-motion'
import { HashRouter, MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
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

function Guard({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { state } = useStore()
  const navigate = useNavigate()
  if (can(state.role, permission)) return <>{children}</>
  return (
    <div className="card mx-auto max-w-xl">
      <EmptyState
        icon={<ShieldAlert size={22} />}
        title="Not available for this role"
        body={`This section is outside the ${roleLabel(state.role)} permission set. Switch role from the avatar menu to see how access changes across the platform.`}
        action={<Button variant="secondary" onClick={() => navigate(-1)}>Go back</Button>}
      />
    </div>
  )
}

/* The single-file build is embedded in a host page that owns the address bar,
   so it routes in memory and never touches location. Ordinary builds keep hash
   routing, which survives a refresh and supports deep links. */
const Router = import.meta.env.MODE === 'single' ? MemoryRouter : HashRouter

export default function App() {
  return (
    <StoreProvider>
      <MotionConfig reducedMotion="user">
        <BootGate>
          <Router>
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
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Router>
        </BootGate>
      </MotionConfig>
    </StoreProvider>
  )
}
