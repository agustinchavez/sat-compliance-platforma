import { redirect } from 'next/navigation'

export default function SettingsPage() {
  // Redirect to organization settings by default
  redirect('/settings/organization')
}
