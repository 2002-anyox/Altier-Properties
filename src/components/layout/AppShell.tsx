import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileSidebar, SidebarContent } from './Sidebar.js'
import { Topbar } from './Topbar.js'
import { TabBar } from './TabBar.js'
import { TrialBanner } from './TrialBanner.js'
import { CommandPalette } from './CommandPalette.js'
import { useStore } from '../../lib/store.js'
import { Toaster } from '../ui'
import { t } from '../../lib/strings.js'
import { pageVariants } from '../../lib/motion.js'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const { toasts, dismissToast } = useStore()

  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lift"
      >
        {t('action.skip')}
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] shadow-rail lg:block">
        <SidebarContent />
      </aside>

      <MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="lg:pl-[248px]">
        <Topbar />
        <TrialBanner />
        {/* The bottom padding clears the tab bar below `lg`, where it is
            fixed over the content, and goes back to normal above it. */}
        <main id="main-content" className="px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
          {/* A keyed enter animation, deliberately without AnimatePresence.
              Coordinating an exit here left the incoming page stranded on the
              exit variant — present in the DOM but at opacity 0, so every
              page after the first looked blank until a reload. An entrance
              alone cannot get stuck: each route mounts fresh and animates in. */}
          <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate">
            <Outlet />
          </motion.div>
        </main>
      </div>

      <TabBar onOpenNav={() => setNavOpen(true)} />

      <CommandPalette />
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
