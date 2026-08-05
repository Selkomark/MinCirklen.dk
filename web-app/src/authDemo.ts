// There's no backend yet, so "have I registered before" has nothing real to check
// against. This local flag stands in for that so the login flow can still demonstrate
// its first-time-vs-returning branch — swap for a real session/account check later.
const REGISTERED_KEY = 'mc_demo_registered'

export function hasRegistered(): boolean {
  return localStorage.getItem(REGISTERED_KEY) === '1'
}

export function markRegistered(): void {
  localStorage.setItem(REGISTERED_KEY, '1')
}
