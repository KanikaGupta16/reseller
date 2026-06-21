export const API = import.meta.env.VITE_API_URL || ""
export const hasBackend = !!import.meta.env.VITE_API_URL

export async function apiFetch(path: string, opts?: RequestInit) {
  if (!hasBackend) throw new Error("Backend not connected")
  return fetch(`${API}${path}`, opts)
}
