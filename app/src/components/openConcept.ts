import { createContext, useContext } from 'react'

export const OpenConceptContext = createContext<(id: string) => void>(() => {})

export function useOpenConcept() {
  return useContext(OpenConceptContext)
}
