import { useEffect, useId, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { format, isValid, parse } from 'date-fns'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  id?: string
}

function parseDateValue(value: string): Date | undefined {
  if (!value) {
    return undefined
  }

  const parsed = parse(value, 'yyyy-MM-dd', new Date())
  return isValid(parsed) ? parsed : undefined
}

export function DateInput({ value, onChange, required, disabled, id }: DateInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (!rootRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const selectedDate = parseDateValue(value)

  return (
    <div className="date-input" ref={rootRef}>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD"
        className="date-input-field"
        value={draftValue}
        required={required}
        disabled={disabled}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraftValue(nextValue)

          if (/^\d{4}-\d{2}-\d{2}$/.test(nextValue) && parseDateValue(nextValue)) {
            onChange(nextValue)
          }

          if (nextValue === '') {
            onChange('')
          }
        }}
        onBlur={() => {
          const normalized = draftValue.trim()
          if (normalized === '') {
            setDraftValue(value)
            return
          }

          const parsed = parseDateValue(normalized)
          if (parsed) {
            const formatted = format(parsed, 'yyyy-MM-dd')
            setDraftValue(formatted)
            if (formatted !== value) {
              onChange(formatted)
            }
            return
          }

          setDraftValue(value)
        }}
      />

      {isOpen && (
        <div className="date-input-popover" role="dialog" aria-label="Choose date">
          <DayPicker
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (!date) {
                return
              }

              const nextValue = format(date, 'yyyy-MM-dd')
              setDraftValue(nextValue)
              onChange(nextValue)
              setIsOpen(false)
            }}
            captionLayout="dropdown"
            fixedWeeks
            showOutsideDays
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  )
}