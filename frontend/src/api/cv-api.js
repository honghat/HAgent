export async function runFullWorkflow(id, params, token) {
  const data = await fetch(`/api/cv/profiles/${id}/full-workflow`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  const result = await data.json().catch(() => ({}))
  if (!data.ok) throw new Error(result.error || 'Request failed')
  return result
}
