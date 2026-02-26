import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProductById, getCategories, updateProductAction, type ProductFormState } from '../../actions'
import { EditProductForm } from './edit-product-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params
  const [product, categories] = await Promise.all([
    getProductById(id),
    getCategories(),
  ])

  if (!product) {
    notFound()
  }

  // Bind the productId to the action
  const boundUpdateAction = async (
    prevState: ProductFormState,
    formData: FormData
  ): Promise<ProductFormState> => {
    'use server'
    return updateProductAction(id, prevState, formData)
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/products/${id}`}
          className="text-sm text-gray-600 hover:text-gray-900 mb-2 flex items-center"
        >
          ← Back to Product
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-gray-600 mt-1">{product.name}</p>
      </div>

      {/* Form */}
      <EditProductForm
        product={product}
        categories={categories}
        updateAction={boundUpdateAction}
        productId={id}
      />
    </div>
  )
}
