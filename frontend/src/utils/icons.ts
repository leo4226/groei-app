export function resolveIconUrl(iconKey: string | null | undefined): string | null {
  return iconKey ? `/icons/${iconKey}.svg` : null
}
