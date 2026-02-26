'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Product } from '@/lib/products/types'
import type { ProductFormState } from '../../actions'

interface EditProductFormProps {
  product: Product
  categories: string[]
  updateAction: (prevState: ProductFormState, formData: FormData) => Promise<ProductFormState>
  productId: string
}

const initialState: ProductFormState = {
  success: false,
  error: null,
  message: null,
}

const COMMON_SAT_PRODUCT_CODES = [
  { code: '01010101', name: 'No existe en el catálogo' },
  { code: '81112100', name: 'Servicios de consultoría de negocios' },
  { code: '80101500', name: 'Servicios de consultoría de negocios' },
  { code: '80111600', name: 'Servicios de personal temporal' },
  { code: '43211503', name: 'Computadoras portátiles' },
  { code: '43211507', name: 'Computadoras de escritorio' },
  { code: '44121600', name: 'Suministros de oficina' },
  { code: '84111500', name: 'Servicios de contabilidad' },
  { code: '84111600', name: 'Servicios de auditoría' },
  { code: '90101500', name: 'Restaurantes y catering' },
]

const COMMON_SAT_UNIT_CODES = [
  { code: 'H87', name: 'Pieza' },
  { code: 'E48', name: 'Unidad de servicio' },
  { code: 'ACT', name: 'Actividad' },
  { code: 'KGM', name: 'Kilogramo' },
  { code: 'LTR', name: 'Litro' },
  { code: 'MTR', name: 'Metro' },
  { code: 'HUR', name: 'Hora' },
  { code: 'DAY', name: 'Día' },
  { code: 'MON', name: 'Mes' },
  { code: 'XBX', name: 'Caja' },
  { code: 'XPK', name: 'Paquete' },
]

export function EditProductForm({ product, categories, updateAction, productId }: EditProductFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(updateAction, initialState)
  const [productType, setProductType] = useState<'product' | 'service'>(product.type)
  const [trackInventory, setTrackInventory] = useState(product.track_inventory || false)
  const [selectedUnitCode, setSelectedUnitCode] = useState(product.sat_unit_code)

  // Handle success - redirect to product detail page
  useEffect(() => {
    if (state.success) {
      router.push(`/products/${productId}`)
    }
  }, [state.success, productId, router])

  const handleCancel = () => {
    router.push(`/products/${productId}`)
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Status Messages */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{state.error}</p>
          {state.validationErrors && state.validationErrors.length > 0 && (
            <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
              {state.validationErrors.map((err, i) => (
                <li key={i}>{err.field}: {err.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.message && state.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700">{state.message}</p>
        </div>
      )}

      {/* Type Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Type</h3>
        <div className="flex space-x-4">
          <label className={`
            flex-1 flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors
            ${productType === 'product' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
          `}>
            <input
              type="radio"
              name="type"
              value="product"
              checked={productType === 'product'}
              onChange={() => setProductType('product')}
              className="sr-only"
            />
            <div className="text-center">
              <span className="text-2xl block mb-1">📦</span>
              <span className={`font-medium ${productType === 'product' ? 'text-blue-700' : 'text-gray-700'}`}>
                Product
              </span>
              <span className="block text-xs text-gray-500">Physical goods</span>
            </div>
          </label>
          <label className={`
            flex-1 flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors
            ${productType === 'service' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}
          `}>
            <input
              type="radio"
              name="type"
              value="service"
              checked={productType === 'service'}
              onChange={() => setProductType('service')}
              className="sr-only"
            />
            <div className="text-center">
              <span className="text-2xl block mb-1">🔧</span>
              <span className={`font-medium ${productType === 'service' ? 'text-purple-700' : 'text-gray-700'}`}>
                Service
              </span>
              <span className="block text-xs text-gray-500">Intangible services</span>
            </div>
          </label>
        </div>
      </div>

      {/* Basic Information */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <div className="md:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={product.name}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Product or service name"
            />
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={product.description || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Detailed description for invoices"
            />
          </div>

          {/* SKU */}
          <div>
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
              SKU
            </label>
            <input
              type="text"
              id="sku"
              name="sku"
              defaultValue={product.sku || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              placeholder="Auto-generated if empty"
            />
          </div>

          {/* Barcode */}
          <div>
            <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-1">
              Barcode
            </label>
            <input
              type="text"
              id="barcode"
              name="barcode"
              defaultValue={product.barcode || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional barcode"
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              id="category"
              name="category"
              list="categories-list"
              defaultValue={product.category || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Electronics, Services"
            />
            <datalist id="categories-list">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <input
              type="text"
              id="tags"
              name="tags"
              defaultValue={product.tags?.join(', ') || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="tag1, tag2, tag3"
            />
          </div>
        </div>
      </div>

      {/* SAT Codes */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">SAT Codes (Required for CFDI)</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SAT Product Code */}
          <div>
            <label htmlFor="sat_product_code" className="block text-sm font-medium text-gray-700 mb-1">
              Clave Producto/Servicio (SAT) *
            </label>
            <select
              id="sat_product_code"
              name="sat_product_code"
              defaultValue={product.sat_product_code}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select SAT code...</option>
              {COMMON_SAT_PRODUCT_CODES.map((code) => (
                <option key={code.code} value={code.code}>
                  {code.code} - {code.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Search the full SAT catalog at sat.gob.mx
            </p>
          </div>

          {/* SAT Unit Code */}
          <div>
            <label htmlFor="sat_unit_code" className="block text-sm font-medium text-gray-700 mb-1">
              Clave Unidad (SAT) *
            </label>
            <select
              id="sat_unit_code"
              name="sat_unit_code"
              value={selectedUnitCode}
              onChange={(e) => setSelectedUnitCode(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select unit...</option>
              {COMMON_SAT_UNIT_CODES.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code} - {unit.name}
                </option>
              ))}
            </select>
          </div>

          {/* Unit Name */}
          <div>
            <label htmlFor="unit_name" className="block text-sm font-medium text-gray-700 mb-1">
              Unit Name (Display) *
            </label>
            <input
              type="text"
              id="unit_name"
              name="unit_name"
              defaultValue={product.unit_name}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Pieza, Hora, Servicio"
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Pricing</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Price */}
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              Price (before tax) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                id="price"
                name="price"
                step="0.01"
                min="0"
                defaultValue={product.price}
                required
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Tax Object */}
          <div>
            <label htmlFor="tax_object" className="block text-sm font-medium text-gray-700 mb-1">
              Objeto de Impuesto
            </label>
            <select
              id="tax_object"
              name="tax_object"
              defaultValue={product.tax_object}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="01">01 - No objeto de impuesto</option>
              <option value="02">02 - Sí objeto de impuesto</option>
              <option value="03">03 - Sí objeto, no obligado desglose</option>
            </select>
          </div>

          {/* IVA Rate */}
          <div>
            <label htmlFor="iva_rate" className="block text-sm font-medium text-gray-700 mb-1">
              IVA Rate
            </label>
            <select
              id="iva_rate"
              name="iva_rate"
              defaultValue={product.iva_rate.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="0.16">16%</option>
              <option value="0.08">8% (Border zone)</option>
              <option value="0">0% (Exempt)</option>
            </select>
          </div>
        </div>

        {/* Tax Retentions */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-3">Tax Retentions (for services)</p>
          <div className="flex space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="iva_retention"
                value="true"
                defaultChecked={product.iva_retention}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">IVA Retention (10.67%)</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="isr_retention"
                value="true"
                defaultChecked={product.isr_retention}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">ISR Retention (10%)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Inventory (Products Only) */}
      {productType === 'product' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Inventory</h3>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="track_inventory"
                value="true"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Track inventory</span>
            </label>
          </div>

          {trackInventory && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="current_stock" className="block text-sm font-medium text-gray-700 mb-1">
                  Current Stock
                </label>
                <input
                  type="number"
                  id="current_stock"
                  name="current_stock"
                  min="0"
                  defaultValue={product.current_stock}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="min_stock" className="block text-sm font-medium text-gray-700 mb-1">
                  Min Stock (Alert)
                </label>
                <input
                  type="number"
                  id="min_stock"
                  name="min_stock"
                  min="0"
                  defaultValue={product.min_stock || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            name="is_active"
            value="true"
            defaultChecked={product.is_active !== false}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-700">Active (available for invoicing)</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Update Product'}
        </button>
      </div>
    </form>
  )
}
