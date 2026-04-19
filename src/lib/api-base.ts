export const getApiBase = () => {
  const value = import.meta.env.VITE_EDGE_API_URL?.trim()
  if (!value) {
    return ''
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}
