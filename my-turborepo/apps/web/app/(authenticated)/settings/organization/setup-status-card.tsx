'use client'

import Link from 'next/link'
import type { OrganizationSetupStatus } from '@/lib/organizations/types'

interface SetupStatusCardProps {
  setupStatus: OrganizationSetupStatus
}

export function SetupStatusCard({ setupStatus }: SetupStatusCardProps) {
  if (setupStatus.isComplete) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-2xl mr-3">✅</span>
          <div>
            <h3 className="font-semibold text-green-800">Setup Complete</h3>
            <p className="text-sm text-green-700">
              Your organization is ready to generate CFDI invoices.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const getStepLink = (step: string): string => {
    if (step.includes('certificate')) return '/settings/certificates'
    if (step.includes('PAC')) return '/settings/pac'
    if (step.includes('address')) return '/settings/organization'
    return '/settings/organization'
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-start">
        <span className="text-2xl mr-3">⚠️</span>
        <div className="flex-1">
          <h3 className="font-semibold text-yellow-800">Setup Incomplete</h3>
          <p className="text-sm text-yellow-700 mb-3">
            Complete the following steps to enable CFDI invoice generation:
          </p>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-yellow-700 mb-1">
              <span>Progress</span>
              <span>{setupStatus.completionPercentage}%</span>
            </div>
            <div className="w-full bg-yellow-200 rounded-full h-2">
              <div
                className="bg-yellow-500 h-2 rounded-full transition-all"
                style={{ width: `${setupStatus.completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Missing Steps */}
          <ul className="space-y-2">
            {setupStatus.missingSteps.map((step, index) => (
              <li key={index} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="w-5 h-5 rounded-full bg-yellow-200 text-yellow-700 flex items-center justify-center text-xs mr-2">
                    {index + 1}
                  </span>
                  <span className="text-sm text-yellow-800">{step}</span>
                </div>
                <Link
                  href={getStepLink(step)}
                  className="text-xs text-yellow-700 hover:text-yellow-900 underline"
                >
                  Fix →
                </Link>
              </li>
            ))}
          </ul>

          {/* Setup Checks */}
          <div className="mt-4 pt-4 border-t border-yellow-200">
            <p className="text-xs text-yellow-700 mb-2">Detailed Status:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <CheckItem label="Basic Info" checked={setupStatus.checks.hasBasicInfo} />
              <CheckItem label="Address" checked={setupStatus.checks.hasCompleteAddress} />
              <CheckItem label="Certificates" checked={setupStatus.checks.hasCertificates} />
              <CheckItem label="Certs Valid" checked={setupStatus.checks.certificatesValid} />
              <CheckItem label="PAC Config" checked={setupStatus.checks.hasPACConfig} />
              <CheckItem label="PAC Tested" checked={setupStatus.checks.pacConfigTested} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center">
      <span className={checked ? 'text-green-600' : 'text-yellow-600'}>
        {checked ? '✓' : '○'}
      </span>
      <span className={`ml-1 ${checked ? 'text-green-700' : 'text-yellow-700'}`}>
        {label}
      </span>
    </div>
  )
}
