import type { Metadata } from 'next'
import Link from 'next/link'
import Card from '@/components/ui/Card'

export const metadata: Metadata = {
  title: 'Privacy Policy | Gym Meals',
  description: 'How Gym Meals handles your account and nutrition data.',
  alternates: { canonical: '/privacy' }
}

export default function PrivacyPage() {
  return (
    <main className="min-h-full bg-background text-foreground py-16 sm:py-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-primary hover:underline underline-offset-2">
          &larr; Back to Gym Meals
        </Link>
        <h1 className="mt-4 font-display font-medium text-3xl sm:text-4xl tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {new Date().getFullYear()}</p>

        <Card className="mt-8 p-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>
            This is an early, plain-language summary of how Gym Meals handles your data - not a final, lawyer-reviewed
            policy. It will be replaced with a complete version before any commercial launch.
          </p>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">What we collect</h2>
            <p>
              When you sign in with Google, we receive your name, email address, and profile photo from Google. When
              you use Gym Meals, we store the nutrition profile, goals, meal plans, and food logs you enter yourself.
            </p>
          </div>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">How it&apos;s used</h2>
            <p>
              Your data is used only to run Gym Meals for you - calculating your targets, building your plans, and
              showing your progress. We don&apos;t sell your data.
            </p>
          </div>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">Who can see it</h2>
            <p>
              Your nutrition data is tied to your account and only accessible to you. It&apos;s stored with our
              authentication and hosting providers (Google Sign-In and Supabase), the infrastructure required to run
              the app - not shared with unrelated third parties.
            </p>
          </div>

          <div>
            <h2 className="font-display font-medium text-base text-foreground mb-1.5">Your choices</h2>
            <p>You can stop using Gym Meals at any time. Contact us if you&apos;d like your account data deleted.</p>
          </div>
        </Card>
      </div>
    </main>
  )
}
