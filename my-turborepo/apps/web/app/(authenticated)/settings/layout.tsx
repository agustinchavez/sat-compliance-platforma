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
  )
}
