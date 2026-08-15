import { useT } from '../context/LanguageContext'

export function useCategoryLabels(): Record<string, string> {
  return useT().plants.categories
}

export function useTypeLabels(): Record<string, string> {
  return useT().plants.types
}

export function useFormLabels(): Record<string, string> {
  return useT().plants.forms
}
