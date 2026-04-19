import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'

import { GeneratePage } from '@/pages/GeneratePage'
import { RunsPage } from '@/pages/RunsPage'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm transition ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
  }`

function App() {
  useEffect(() => {
    const healthUrl = import.meta.env.VITE_RENDER_WORKER_HEALTH_URL?.trim()
    if (!healthUrl) {
      return
    }

    // Fire-and-forget warmup ping to wake sleeping worker instances.
    void fetch(healthUrl).catch(() => {
      // Ignore warmup errors; the app should stay usable.
    })
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <h1 className="text-lg font-semibold tracking-tight">Kontent AI</h1>
          <nav className="flex items-center gap-2">
            <NavLink className={navClassName} to="/generate">
              Generate
            </NavLink>
            <NavLink className={navClassName} to="/runs">
              Runs
            </NavLink>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
        <Routes>
          <Route element={<GeneratePage />} path="/generate" />
          <Route element={<RunsPage />} path="/runs" />
          <Route element={<Navigate replace to="/generate" />} path="*" />
        </Routes>
      </section>
    </main>
  )
}

export default App
