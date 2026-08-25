import { MotionConfig } from 'framer-motion'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { StoreProvider, useStore } from './lib/store'
import { AppShell } from './components/layout/AppShell'
import { can, roleLabel, type Permission } from './lib/rbac'
import { Button, EmptyState } from './components/ui'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import Availability from './pages/Availability'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Bookings from './pages/Bookings'
import Payments from './pages/Payments'
import Maintenance from './pages/Maintenance'
import Notifications from './pages/Notifications'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function Guard({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { state } = useStore()
  if (can(state.role, permission)) return <>{children}</>
  return (
    <div className="card mx-auto max-w-xl">
      <EmptyState
        icon={<ShieldAlert size={22} />}
        title="Not available for this role"
        body={`This section is outside the ${roleLabel(state.role)} permission set. Switch role from the avatar menu to see how access changes across the platform.`}
        action={<Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>}
      />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <MotionConfig reducedMotion="user">
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
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </MotionConfig>
    </StoreProvider>
  )
}
