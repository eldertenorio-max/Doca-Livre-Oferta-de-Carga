declare module 'easy-location-br' {
  export type BrState = { id: string; name: string }
  export type BrCity = { stateId: string; name: string; capital?: boolean }

  export function getAllStates(): BrState[]
  export function getAllCities(): BrCity[]
  export function getStateCities(stateId: string): BrCity[]
}
