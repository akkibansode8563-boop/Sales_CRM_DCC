import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Remove the HTML skeleton loader once React has painted
if (typeof window.__removeSkeleton === 'function') {
  window.__removeSkeleton()
}
