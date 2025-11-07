import { requireAdminOrOwner } from '@/lib/rbac'
import { getCurrentUserPermissions } from '../actions'
import { PermissionTesterClient } from './PermissionTesterClient'

export default async function PermissionsTestPage() {
  // Protect page
  const currentUser = await requireAdminOrOwner()

  // Get current user's permissions
  const permissionsData = await getCurrentUserPermissions()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Permission Testing</h1>
          <p className="mt-2 text-sm text-gray-600">
            Test permission checks and view your current permissions
          </p>
        </div>

        {/* Current User Info */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Your Current Permissions</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">User ID</p>
              <p className="font-mono text-sm">{permissionsData?.userId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="text-sm">{permissionsData?.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Role</p>
              <p className="text-sm font-semibold capitalize">{permissionsData?.role}</p>
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Permission Matrix</h3>
            <div className="space-y-2">
              {permissionsData?.permissions &&
                Object.entries(permissionsData.permissions).map(([resource, actions]) => (
                  <div key={resource} className="flex items-start">
                    <div className="w-32 font-medium text-sm text-gray-700 capitalize">
                      {resource}:
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1">
                      {Array.isArray(actions) && actions.length > 0 ? (
                        actions.map((action) => (
                          <span
                            key={action}
                            className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded"
                          >
                            {action}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-400">No permissions</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Permission Tester */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Test Permission Check</h2>
          <PermissionTesterClient />
        </div>
      </div>
    </div>
  )
}
