import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomerById, getSATCatalogs, updateCustomerAction, type CustomerFormState } from '../../actions'
import { EditCustomerForm } from './edit-customer-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCustomerPage({ params }: PageProps) {
  const { id } = await params
  const [customer, catalogs] = await Promise.all([
    getCustomerById(id),
    getSATCatalogs(),
  ])

  if (!customer) {
    notFound()
  }

  // Bind the customerId to the action
  const boundUpdateAction = async (
    prevState: CustomerFormState,
    formData: FormData
  ): Promise<CustomerFormState> => {
    'use server'
    return updateCustomerAction(id, prevState, formData)
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/customers/${id}`}
          className="text-sm text-gray-600 hover:text-gray-900 mb-2 flex items-center"
        >
          ← Back to Customer
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Customer</h1>
        <p className="text-gray-600 mt-1">{customer.legal_name}</p>
      </div>

      {/* Form */}
      <EditCustomerForm
        customer={customer}
        taxRegimes={catalogs.taxRegimes}
        cfdiUses={catalogs.cfdiUses}
        updateAction={boundUpdateAction}
        customerId={id}
      />
    </div>
  )
}
