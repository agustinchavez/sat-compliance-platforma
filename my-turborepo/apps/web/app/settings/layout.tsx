import { requireAuth } from '@/lib/auth'
import Link from 'next/link'

const settingsNav = [
  { name: 'Organization', href: '/settings/organization', icon: '🏢' },
  { name: 'Certificates', href: '/settings/certificates', icon: '📜' },
  { name: 'PAC Provider', href: '/settings/pac', icon: '🔗' },
  { name: 'Team', href: '/settings/team', icon: '👥' },
  { name: 'Preferences', href: '/settings/preferences', icon: '⚙️' },
]

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="text-xl font-bold text-gray-900">
                SAT Compliance
              </Link>
              <span className="ml-4 text-gray-400">/</span>
              <span className="ml-4 text-gray-600">Settings</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.fullName}</span>
              <Link
                href="/dashboard"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <aside className="w-64 flex-shrink-0">
            <nav className="bg-white shadow rounded-lg p-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Settings
              </h2>
              <ul className="space-y-1">
                {settingsNav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <span className="mr-3 text-lg">{item.icon}</span>
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Organization Info Card */}
            <div className="mt-4 bg-white shadow rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Current Organization
              </h3>
              <p className="font-medium text-gray-900">{user.organization.name}</p>
              <p className="text-sm text-gray-600">{user.organization.rfc}</p>
              <p className="text-xs text-gray-500 mt-1 capitalize">
                Plan: {user.organization.plan}
              </p>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
