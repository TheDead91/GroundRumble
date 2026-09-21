import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { UIProvider } from './context/UIContext'
import { ProvidersProvider } from './context/ProvidersContext'
import { TestsProvider } from './context/TestsContext'
import { HistoryProvider } from './context/HistoryContext'
import { AuditProvider } from './context/AuditContext'
import { AIGenProvider } from './context/AIGenContext'
import { SettingsProvider } from './context/SettingsContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <UIProvider>
        <ProvidersProvider>
          <TestsProvider>
            <HistoryProvider>
              <AuditProvider>
                <AIGenProvider>
                  <SettingsProvider>
                    <App />
                  </SettingsProvider>
                </AIGenProvider>
              </AuditProvider>
            </HistoryProvider>
          </TestsProvider>
        </ProvidersProvider>
      </UIProvider>
    </ErrorBoundary>
  </StrictMode>,
)
