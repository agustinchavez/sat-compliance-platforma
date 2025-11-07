import { requireAdminOrOwner } from '@/lib/rbac'
import { getOrganizationUsers } from '../actions'
import { UserManagementClient } from './UserManagementClient'

export default async function UsersAdminPage() {
  // Protect page - only admin or owner can access
  const currentUser = await requireAdminOrOwner()

  // Fetch all users in organization
  const users = await getOrganizationUsers()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage user roles and permissions for your organization
          </p>
        </div>

        {/* Current User Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">👤</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Logged in as: {currentUser.fullName}
              </h3>
              <p className="text-sm text-blue-600">
                Role: <span className="font-semibold capitalize">{currentUser.role}</span>
                {' | '}
                Email: {currentUser.email}
              </p>
            </div>
          </div>
        </div>

        {/* User Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <UserManagementClient
            users={users}
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
          />
        </div>
      </div>
    </div>
  )
}
