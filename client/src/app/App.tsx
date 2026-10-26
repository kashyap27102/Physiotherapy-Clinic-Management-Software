import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { Toaster } from '@/components/ui/sonner'
import { isApiError } from '@/api'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Do not retry permission or not-found errors; they will not fix themselves.
      retry: (count, error) => count < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
    },
  },
})

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
