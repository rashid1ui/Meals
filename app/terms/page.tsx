import type { Metadata } from 'next'
import Link from 'next/link'
import Card from '@/components/ui/Card'

export const metadata: Metadata = {
  title: 'Terms of Service | Gym Meals',
  description: 'The terms for using Gym Meals.',
  alternates: { canonical: '/terms' }
}

export default function TermsPage() {
  return (
    <main className="min-h-full bg-background text-foreground py-16 sm:py-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-primary hover:underline underline-offset-2">
          &larr; Back to Gym Meals
        </Link>
        <h1 className="mt-4 font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {new Date().getFullYear()}</p>

        <Card className="mt-8 p-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>
            This is an early, plain-language summary of the terms for using Gym Meals - not a final,
            lawyer-reviewed agreement. It will be replaced with a complete version before any commercial launch.
          </p>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">What Gym Meals is</h2>
            <p>
              Gym Meals is a nutrition planning and tracking tool. Calorie and macro targets, and the meal plans you
              build, are calculations and choices - not medical or clinical advice, and not a guarantee of any
              body-composition or health outcome.
            </p>
          </div>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">Your account</h2>
            <p>
              You&apos;re responsible for the accuracy of the information you enter (profile, goals, foods logged).
              Keep your Google account, which Gym Meals uses to sign you in, secure.
            </p>
          </div>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">Product changes</h2>
            <p>
              Gym Meals is under active development. Features - including upcoming AI-powered planning - may change,
              and manual meal planning remains available regardless of what&apos;s added later.
            </p>
          </div>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">Questions</h2>
            <p>Contact us if you have questions about these terms or your account.</p>
          </div>
        </Card>
      </div>
    </main>
  )
}
