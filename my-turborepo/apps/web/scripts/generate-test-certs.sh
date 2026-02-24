#!/bin/bash

# =============================================================================
# Generate Test Certificate Files for SAT Compliance Platform
# =============================================================================
#
# This script generates self-signed certificate files (.cer and .key)
# for testing the certificate upload UI.
#
# NOTE: These certificates will NOT work with actual SAT services.
# They are only for testing the UI flow.
#
# For actual SAT integration testing, use:
# - SAT test FIEL from: https://portalsat.plataforma.sat.gob.mx/CertSAT/
# - Finkok sandbox certificates: https://wiki.finkok.com/
#
# =============================================================================

set -e

# Configuration
OUTPUT_DIR="${1:-./test-certificates}"
RFC="${2:-TCO010101AAA}"
PASSWORD="${3:-TestPassword123}"
DAYS_VALID=365

echo "========================================"
echo "SAT Test Certificate Generator"
echo "========================================"
echo ""
echo "Output directory: $OUTPUT_DIR"
echo "RFC: $RFC"
echo "Password: $PASSWORD"
echo "Valid for: $DAYS_VALID days"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Check if OpenSSL is available
if ! command -v openssl &> /dev/null; then
    echo "ERROR: OpenSSL is not installed or not in PATH"
    echo "Install with: brew install openssl"
    exit 1
fi

echo "Step 1: Generating RSA private key..."
openssl genrsa -out private-key.pem 2048 2>/dev/null

echo "Step 2: Creating certificate signing request..."
openssl req -new -key private-key.pem -out cert.csr -subj "/C=MX/ST=CDMX/L=Ciudad de Mexico/O=Test Company SA de CV/OU=IT Department/CN=$RFC" 2>/dev/null

echo "Step 3: Generating self-signed certificate..."
openssl x509 -req -days $DAYS_VALID -in cert.csr -signkey private-key.pem -out certificate.pem 2>/dev/null

echo "Step 4: Converting certificate to DER format (.cer)..."
openssl x509 -in certificate.pem -outform DER -out certificate.cer

echo "Step 5: Converting private key to PKCS#8 DER format (.key)..."
# Create encrypted PKCS#8 key (as SAT would provide)
openssl pkcs8 -topk8 -inform PEM -outform DER -in private-key.pem -out private-key.key -passout pass:$PASSWORD

# Clean up intermediate files
rm -f private-key.pem cert.csr certificate.pem

echo ""
echo "========================================"
echo "Certificate Generation Complete!"
echo "========================================"
echo ""
echo "Generated files:"
echo "  - $OUTPUT_DIR/certificate.cer (Certificate file)"
echo "  - $OUTPUT_DIR/private-key.key (Private key file)"
echo ""
echo "Password: $PASSWORD"
echo ""
echo "Certificate details:"
openssl x509 -in certificate.cer -inform DER -noout -subject -dates 2>/dev/null | head -5
echo ""
echo "========================================"
echo "How to use:"
echo "========================================"
echo "1. Go to Settings > Certificates in the app"
echo "2. Upload certificate.cer as the Certificate file"
echo "3. Upload private-key.key as the Private Key file"
echo "4. Enter password: $PASSWORD"
echo "5. Click Upload"
echo ""
echo "NOTE: This is a self-signed certificate for UI testing only."
echo "It will NOT work with SAT services."
echo "========================================"
