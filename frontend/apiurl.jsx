const cleanBaseUrl = (value, fallback) => (value || fallback).replace(/\/+$/, '')

export const pythonUrl = cleanBaseUrl(process.env.NEXT_PUBLIC_PYTHON_URL, 'http://localhost:8000')
export const nodeUrl = cleanBaseUrl(process.env.NEXT_PUBLIC_NODE_URL, 'http://localhost:5000')
export const websocketUrl = cleanBaseUrl(process.env.NEXT_PUBLIC_WEBSOCKET_URL, 'ws://localhost:8000')
