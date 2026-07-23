const PANEL_SIZE_KEY = 'doca-livre-publish-panel-size'

export type PanelSize = 'normal' | 'medio' | 'largo'

export function loadPanelSize(): PanelSize {
  try {
    const v = localStorage.getItem(PANEL_SIZE_KEY)
    if (v === 'normal' || v === 'medio' || v === 'largo') return v
  } catch {
    /* ignore */
  }
  return 'largo'
}

export function savePanelSize(size: PanelSize) {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, size)
  } catch {
    /* ignore */
  }
}

export function panelSizeClass(size: PanelSize): string {
  if (size === 'largo') return 'w-full min-w-0 flex-1'
  if (size === 'medio') return 'w-full max-sm:min-w-0 sm:w-[min(720px,62vw)]'
  return 'w-full max-sm:min-w-0 sm:w-[min(480px,94vw)]'
}
