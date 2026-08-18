import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import CloudRoot from './cloud/CloudRoot'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><CloudRoot /></React.StrictMode>,
)
