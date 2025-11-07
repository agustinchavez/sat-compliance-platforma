import { createClient } from '@/lib/supabase/server'

export default async function TestDBPage() {
  const supabase = await createClient()

  // Test the connection by querying the database
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .limit(5)

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Database Connection Error</h1>
        <pre className="bg-red-50 p-4 rounded">{JSON.stringify(error, null, 2)}</pre>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-green-600 mb-4">Database Connected Successfully! ✓</h1>
      <div className="bg-green-50 p-4 rounded mb-4">
        <p className="font-semibold">Supabase is working correctly!</p>
        <p className="text-sm text-gray-600 mt-2">Found {data?.length || 0} organizations in the database.</p>
      </div>

      {data && data.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Organizations:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-blue-800">
            No organizations found yet. The table exists but is empty.
            You can start adding data through your app!
          </p>
        </div>
      )}
    </div>
  )
}
