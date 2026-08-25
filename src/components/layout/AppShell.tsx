import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileSidebar, SidebarContent } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { useStore } from '../../lib/store'
import { Toaster } from '../ui'
import { t } from '../../lib/strings'
import { pageVariants } from '../../lib/motion'

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
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main id="main-content" className="px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
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

      <CommandPalette />
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
