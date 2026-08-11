import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'

export default async function DashboardPage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-gray-50">
      <div className="w-full max-w-4xl p-8 bg-white rounded-xl shadow-lg border border-gray-100 space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-900">Diet Dashboard</h1>
          <SignOutButton />
        </div>
        
        <div className="bg-blue-50 text-blue-800 p-4 rounded-md">
          <p className="font-medium">Welcome back!</p>
          <p className="text-sm mt-1">Logged in as: {user.email}</p>
        </div>

        <p className="text-gray-500">Dashboard functionality will be implemented in Phase 7.</p>
      </div>
    </main>
  )
}
