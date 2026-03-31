import { useEffect, useState } from 'react'

const BREAKPOINTS = {
  large: '(min-width: 1100px)',
  medium: '(min-width: 721px)',
} as const

function getLimit(): number {
  if (window.matchMedia(BREAKPOINTS.large).matches) return 36
  if (window.matchMedia(BREAKPOINTS.medium).matches) return 25
  return 15
}

export function useViewportLimit(): number {
  const [limit, setLimit] = useState<number>(getLimit)

  useEffect(() => {
    const large = window.matchMedia(BREAKPOINTS.large)
    const medium = window.matchMedia(BREAKPOINTS.medium)

    const handler = () => setLimit(getLimit())

    large.addEventListener('change', handler)
    medium.addEventListener('change', handler)

    return () => {
      large.removeEventListener('change', handler)
      medium.removeEventListener('change', handler)
    }
  }, [])

  return limit
}
