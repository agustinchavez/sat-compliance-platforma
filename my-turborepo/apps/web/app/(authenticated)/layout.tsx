import { requireAuth } from '@/lib/auth'
import { signOutAction } from '@/lib/auth/actions'
import { AppHeader } from '../components/app-header'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader userName={user.fullName} signOutAction={signOutAction} />
      {children}
    </div>
  )
}
