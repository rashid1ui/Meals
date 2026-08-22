'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { AlertIcon } from '@/components/ui/icons'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
      }
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card elevated className="w-full max-w-md p-10 flex flex-col items-center">
        <h1 className="font-display text-4xl font-bold text-foreground mb-3 text-center tracking-tight">
          Welcome to Gym Meals
        </h1>
        <p className="text-muted-foreground text-center mb-10 text-lg">
          Sign in to sync your progress across devices.
        </p>

        {error && (
          <div className="w-full flex items-start gap-2 p-4 mb-6 text-sm text-error bg-error/10 border border-error/30 rounded-control">
            <AlertIcon size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Button
          variant="secondary"
          onClick={handleGoogleLogin}
          loading={loading}
          className="w-full text-lg"
        >
          {!loading && (
            <svg className="w-6 h-6" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          {loading ? 'Connecting...' : 'Continue with Google'}
        </Button>
      </Card>
    </main>
  )
}

