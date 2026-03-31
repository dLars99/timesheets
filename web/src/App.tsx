import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { isTauri } from '@tauri-apps/api/core'
import './App.css'
import { ReportPanel } from './components/ReportPanel'
import { TaskForm } from './components/TaskForm'
import { TaskList } from './components/TaskList'
import { TaskSearchPanel } from './components/TaskSearchPanel'
import { TimerPanel } from './components/TimerPanel'
import { useTimesheetStore } from './stores/useTimesheetStore'

type CloseEventLike = {
  preventDefault: () => void
}

type AppWindowLike = {
  onCloseRequested: (handler: (event: CloseEventLike) => void) => Promise<() => void>
  close: () => Promise<void>
}

function App() {
  const isDesktop = isTauri()
  const hydrate = useTimesheetStore((state) => state.hydrate)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)
  const recoveryMessage = useTimesheetStore((state) => state.recoveryMessage)
  const confirmRecovery = useTimesheetStore((state) => state.confirmRecovery)
  const discardRecovery = useTimesheetStore((state) => state.discardRecovery)
  const tasks = useTimesheetStore((state) => state.tasks)
  const [activeView, setActiveView] = useState<'today' | 'report' | 'search'>('today')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const activeTimerTaskIdRef = useRef(activeTimerTaskId)
  const allowCloseRef = useRef(false)
  const appWindowRef = useRef<AppWindowLike | undefined>(undefined)

  const getAppWindow = async (): Promise<AppWindowLike> => {
    if (appWindowRef.current) {
      return appWindowRef.current
    }

    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow() as unknown as AppWindowLike
    appWindowRef.current = appWindow
    return appWindow
  }

  useEffect(() => {
    activeTimerTaskIdRef.current = activeTimerTaskId
  }, [activeTimerTaskId])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (isDesktop) {
      return undefined
    }

    const onBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (!activeTimerTaskId) {
        return undefined
      }

      await pauseActiveTimer()

      const message = 'You have an active timer. Closing now will pause it.'
      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [activeTimerTaskId, isDesktop, pauseActiveTimer])

  useEffect(() => {
    if (!isDesktop) {
      return undefined
    }

    let disposed = false
    let localUnlisten: (() => void) | undefined

    void (async () => {
      const appWindow = await getAppWindow()

      const unlisten = await appWindow.onCloseRequested((event) => {
        // If we've been explicitly told to close, allow it
        if (allowCloseRef.current) {
          return
        }

        // If timer is running, intercept and show confirmation
        if (activeTimerTaskIdRef.current) {
          event.preventDefault()
          setCloseError(null)
          setShowCloseConfirm(true)
        }
        // Otherwise, allow close to proceed normally
      })

      // React Strict Mode can unmount before async listener setup resolves.
      // If that happened, immediately detach this listener.
      if (disposed) {
        unlisten()
        return
      }

      localUnlisten = unlisten
    })()

    return () => {
      disposed = true
      if (localUnlisten) {
        localUnlisten()
      }
    }
  }, [isDesktop])

  const confirmCloseWithTimer = async () => {
    if (!isDesktop) {
      return
    }

    setIsClosing(true)
    setCloseError(null)

    try {
      // Allow the next close request to pass through immediately and avoid
      // stale active-timer state blocking the programmatic close.
      allowCloseRef.current = true
      activeTimerTaskIdRef.current = null

      await pauseActiveTimer()

      const appWindow = await getAppWindow()
      await appWindow.close()

      setShowCloseConfirm(false)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to close app.'
      setCloseError(message)
      setIsClosing(false)
      allowCloseRef.current = false
    }
  }

  const cancelCloseWithTimer = () => {
    setCloseError(null)
    setShowCloseConfirm(false)
  }

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
          <h1>More work. Less Excel.</h1>
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

      {showCloseConfirm && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-modal-title"
          >
            <h2 id="close-modal-title">Close app with active timer?</h2>
            <p>
              Closing now will pause the running timer and save elapsed time.
            </p>
            {closeError && <p className="form-error">{closeError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelCloseWithTimer}
                disabled={isClosing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmCloseWithTimer()}
                disabled={isClosing}
              >
                {isClosing ? 'Closing...' : 'Pause and close'}
              </button>
            </div>
          </section>
        </div>
      )}

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
        <button
          className={activeView === 'search' ? 'active' : ''}
          onClick={() => setActiveView('search')}
        >
          Task Search
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
      ) : activeView === 'report' ? (
        <section className="workspace-grid single-column">
          <div className="panel panel-wide">
            <h2>Project Totals</h2>
            <ReportPanel />
          </div>
        </section>
      ) : (
        <section className="workspace-grid single-column">
          <div className="panel panel-wide">
            <h2>Task Search</h2>
            <TaskSearchPanel />
          </div>
        </section>
      )}
    </main>
  )
}

export default App
