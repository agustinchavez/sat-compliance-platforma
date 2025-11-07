import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function Home() {
  const user = await getCurrentUser()

  // Redirect based on authentication status
  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
