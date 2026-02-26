'use client'

import { useState } from 'react'
import { deleteCertificateAction } from './actions'
import type { CertificateInfo } from '@/lib/organizations/types'

interface CertificateStatusCardProps {
  certificateInfo: CertificateInfo
  expirationStatus: {
    hasExpired: boolean
    isExpiring: boolean
    daysRemaining: number | null
    validTo: Date | null
  }
}

export function CertificateStatusCard({
  certificateInfo,
  expirationStatus,
}: CertificateStatusCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteCertificateAction()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting certificate:', error)
      setIsDeleting(false)
    }
  }

  const getStatusColor = () => {
    if (expirationStatus.hasExpired) return 'red'
    if (expirationStatus.isExpiring) return 'yellow'
    return 'green'
  }

  const getStatusText = () => {
    if (expirationStatus.hasExpired) return 'Expired'
    if (expirationStatus.isExpiring) return 'Expiring Soon'
    return 'Valid'
  }

  const color = getStatusColor()
  const bgColor = color === 'green' ? 'bg-green-50' : color === 'yellow' ? 'bg-yellow-50' : 'bg-red-50'
  const borderColor = color === 'green' ? 'border-green-200' : color === 'yellow' ? 'border-yellow-200' : 'border-red-200'
  const textColor = color === 'green' ? 'text-green-800' : color === 'yellow' ? 'text-yellow-800' : 'text-red-800'

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-6`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start">
          <span className="text-3xl mr-4">
            {color === 'green' ? '✅' : color === 'yellow' ? '⚠️' : '❌'}
          </span>
          <div>
            <h3 className={`text-lg font-semibold ${textColor}`}>
              Certificate Status: {getStatusText()}
            </h3>
            <p className={`text-sm ${textColor} opacity-80 mt-1`}>
              {expirationStatus.hasExpired
                ? 'Your certificate has expired. Please upload a new one.'
                : expirationStatus.isExpiring
                  ? `Your certificate expires in ${expirationStatus.daysRemaining} days. Consider renewing soon.`
                  : `Your certificate is valid for ${expirationStatus.daysRemaining} more days.`
              }
            </p>
          </div>
        </div>

        {/* Delete Button */}
        <div>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-gray-500 hover:text-red-600 px-3 py-1 rounded border border-gray-300 hover:border-red-300"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-sm text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Certificate Details */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Serial Number</p>
          <p className="font-mono text-sm mt-1">{certificateInfo.serialNumber.slice(0, 20)}...</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">RFC</p>
          <p className="font-mono text-sm mt-1">{certificateInfo.rfc}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Valid From</p>
          <p className="text-sm mt-1">
            {new Date(certificateInfo.validFrom).toLocaleDateString('es-MX', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Valid Until</p>
          <p className="text-sm mt-1">
            {new Date(certificateInfo.validTo).toLocaleDateString('es-MX', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* Issuer Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <span className="font-medium">Issued by:</span> {certificateInfo.issuer}
        </p>
      </div>
    </div>
  )
}
