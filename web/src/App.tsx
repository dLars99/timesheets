import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import './App.css'
import { ReportPanel } from './components/ReportPanel'
import { TaskForm } from './components/TaskForm'
import { TaskList } from './components/TaskList'
import { TimerPanel } from './components/TimerPanel'
import { useTimesheetStore } from './stores/useTimesheetStore'

function App() {
  const hydrate = useTimesheetStore((state) => state.hydrate)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)
  const recoveryMessage = useTimesheetStore((state) => state.recoveryMessage)
  const confirmRecovery = useTimesheetStore((state) => state.confirmRecovery)
  const discardRecovery = useTimesheetStore((state) => state.discardRecovery)
  const tasks = useTimesheetStore((state) => state.tasks)
  const [activeView, setActiveView] = useState<'today' | 'report'>('today')

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!activeTimerTaskId) {
        return undefined
      }

      pauseActiveTimer()

      const message = 'You have an active timer. Closing now will pause it.'
      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [activeTimerTaskId, pauseActiveTimer])

  useEffect(() => {
    if (!(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)) {
      return undefined
    }

    let unlisten: (() => void) | null = null

    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      unlisten = await getCurrentWindow().onCloseRequested((event) => {
        if (!activeTimerTaskId) {
          return
        }

        const shouldClose = window.confirm(
          'A timer is currently running. Close the app and pause the timer?',
        )

        if (!shouldClose) {
          event.preventDefault()
          return
        }

        pauseActiveTimer()
      })
    })()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [activeTimerTaskId, pauseActiveTimer])

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayTotalMs = useMemo(() => {
    return tasks
      .filter((task) => task.taskDate === today)
      .reduce((sum, task) => sum + task.totalMs, 0)
  }, [tasks, today])

  const todayHours = (todayTotalMs / 3600000).toFixed(2)

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Timesheets</p>
          <h1>Track work without friction</h1>
          <p className="subtitle">
            Local-first tracking with quick task switching, summary reporting, and
            CSV export.
          </p>
        </div>
        <div className="metrics">
          <div className="metric-card">
            <span>Today</span>
            <strong>{today}</strong>
          </div>
          <div className="metric-card">
            <span>Tracked</span>
            <strong>{todayHours} h</strong>
          </div>
        </div>
      </header>

      {recoveryMessage && (
        <aside className="recovery-banner">
          <span>{recoveryMessage}</span>
          <div className="recovery-actions">
            <button type="button" className="secondary-button" onClick={() => void discardRecovery()}>
              Discard recovered time
            </button>
            <button type="button" onClick={() => void confirmRecovery()}>
              Keep recovered time
            </button>
          </div>
        </aside>
      )}

      <nav className="view-toggle" aria-label="Primary views">
        <button
          className={activeView === 'today' ? 'active' : ''}
          onClick={() => setActiveView('today')}
        >
          Tasks
        </button>
        <button
          className={activeView === 'report' ? 'active' : ''}
          onClick={() => setActiveView('report')}
        >
          Reports
        </button>
      </nav>

      {activeView === 'today' ? (
        <section className="workspace-grid">
          <div className="panel">
            <h2>New Task</h2>
            <TaskForm />
          </div>

          <div className="panel">
            <h2>Timer</h2>
            <TimerPanel />
          </div>

          <div className="panel panel-wide">
            <h2>Task List</h2>
            <TaskList />
          </div>
        </section>
      ) : (
        <section className="workspace-grid single-column">
          <div className="panel panel-wide">
            <h2>Project Totals</h2>
            <ReportPanel />
          </div>
        </section>
      )}
    </main>
  )
}

export default App
