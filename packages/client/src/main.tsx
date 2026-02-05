import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactFlowProvider } from '@xyflow/react'
import App from './App'
import '@xyflow/react/dist/style.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </QueryClientProvider>
  </StrictMode>
)
