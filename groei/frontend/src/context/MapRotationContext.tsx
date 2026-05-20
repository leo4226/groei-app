import { createContext, useContext } from 'react'

// Counter-rotation in SVG degrees (0 = landscape/desktop, 90 = portrait/mobile)
export const MapRotationContext = createContext(0)
export const useMapRotation = () => useContext(MapRotationContext)
