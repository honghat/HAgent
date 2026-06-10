const DEVICE_ID_KEY = 'hagent_device_id'
const DEVICE_SECRET_KEY = 'hagent_device_secret'
const SIGNED_OUT_KEY = 'hagent_signed_out'

let memoryDevice = null

function storageGet(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function randomHex(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(buffer)
    return Array.from(buffer, value => value.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function newDeviceId() {
  if (window.crypto?.randomUUID) return `dev_${window.crypto.randomUUID().replaceAll('-', '')}`
  return `dev_${randomHex(16)}`
}

export function getDeviceCredentials() {
  const deviceId = storageGet(DEVICE_ID_KEY) || memoryDevice?.deviceId || ''
  const deviceSecret = storageGet(DEVICE_SECRET_KEY) || memoryDevice?.deviceSecret || ''
  if (!deviceId || !deviceSecret) return null
  return { deviceId, deviceSecret }
}

export function getOrCreateDeviceCredentials() {
  const existing = getDeviceCredentials()
  if (existing) return existing
  const next = { deviceId: newDeviceId(), deviceSecret: randomHex(32) }
  saveDeviceCredentials(next)
  memoryDevice = next
  return next
}

export function saveDeviceCredentials({ deviceId, deviceSecret } = {}) {
  const current = memoryDevice || {}
  memoryDevice = {
    deviceId: deviceId || current.deviceId || '',
    deviceSecret: deviceSecret || current.deviceSecret || '',
  }
  if (deviceId) storageSet(DEVICE_ID_KEY, deviceId)
  if (deviceSecret) storageSet(DEVICE_SECRET_KEY, deviceSecret)
}

export function isSignedOut() {
  return storageGet(SIGNED_OUT_KEY) === '1'
}

export function setSignedOut(value) {
  if (value) storageSet(SIGNED_OUT_KEY, '1')
  else storageRemove(SIGNED_OUT_KEY)
}
