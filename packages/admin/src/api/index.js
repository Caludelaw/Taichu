const BASE = '/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('taichu_token')
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(BASE + path, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || res.statusText)
  return data
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  createApiKey: (body) => request('/auth/apikeys', { method: 'POST', body: JSON.stringify(body) }),
  listApiKeys: () => request('/auth/apikeys'),
  revokeApiKey: (prefix) => request(`/auth/apikeys/${prefix}`, { method: 'DELETE' }),

  // Content
  listContent: (type, params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/content/${type}${q ? '?' + q : ''}`)
  },
  reorderContent: (type, ids) =>
    request(`/content/${type}/reorder`, { method: 'PUT', body: JSON.stringify({ ids }) }),
  getContent: (type, id) => request(`/content/${type}/${id}`),
  createContent: (type, data, status = 'draft') =>
    request(`/content/${type}`, { method: 'POST', body: JSON.stringify({ data, status }) }),
  updateContent: (type, id, data) =>
    request(`/content/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ data }) }),
  deleteContent: (type, id) =>
    request(`/content/${type}/${id}`, { method: 'DELETE' }),

  // Content Types
  listTypes: () => request('/content-types'),
  getContentTypeSchema: (name) => request(`/content-types/${name}`),

  // Media
  uploadMedia: async (file) => {
    const token = localStorage.getItem('taichu_token')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(BASE + '/media/upload', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || res.statusText)
    return data
  },
  listMedia: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/media${q ? '?' + q : ''}`)
  },
  getMedia: (id) => request(`/media/${id}`),
  deleteMedia: (id) => request(`/media/${id}`, { method: 'DELETE' }),

  // Health
  health: () => request('/health'),

  // Settings
  getSettings: () => request('/site-settings'),

  // Audit
  getAuditLog: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/audit${q ? '?' + q : ''}`)
  },

  // Webhooks
  getWebhooks: () => request('/webhooks'),

  // Pipelines
  getPipelines: () => request('/pipelines'),

  // Revisions
  getRevisions: (type, id) => request(`/content/${type}/${id}/revisions`),
  getRevisionDiff: (type, id, fromRevId, toRevId) =>
    request(`/content/${type}/${id}/revisions/diff?from=${fromRevId}&to=${toRevId}`),
  restoreRevision: (type, id, revId) =>
    request(`/content/${type}/${id}/revisions/${revId}/restore`, { method: 'POST' }),

  // Collaboration
  getCollabSessions: () => request('/collab/sessions'),
  acquireCollab: (docId) => request(`/collab/sessions/${docId}`, { method: 'POST' }),
  releaseCollab: (docId) => request(`/collab/sessions/${docId}`, { method: 'DELETE' }),

  // Workflow
  requestReview: (docId) => request(`/workflow/request/${docId}`, { method: 'POST' }),
  approveReview: (docId, body) => request(`/workflow/approve/${docId}`, { method: 'POST', body: JSON.stringify(body) }),
  rejectReview: (docId, body) => request(`/workflow/reject/${docId}`, { method: 'POST', body: JSON.stringify(body) }),
  getWorkflowStatus: (docId) => request(`/workflow/status/${docId}`),

  // Aliases (backward compat)
  get list() { return this.listContent },
  get get() { return this.getContent },
  get create() { return this.createContent },
  get update() { return this.updateContent },
  get delete() { return this.deleteContent },

  // Raw request (for plugins, marketplace, etc.)
  request: (path, opts) => request(path, opts),
}
