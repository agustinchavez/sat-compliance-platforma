# Component 10: Receipt OCR Service

## ✅ WHAT'S ALREADY BUILT

### Components 1-9 Complete ✓

- ✅ Authentication (Component 01) — Supabase-based auth, JWT sessions
- ✅ Role-Based Access Control (Component 02) — Redis-cached RBAC, sub-5ms permission checks
- ✅ Multi-Tenant Context Manager (Component 03) — org isolation, Row-Level Security
- ✅ Organization Service (Component 04) — encrypted CFDI certificate storage (AES-256, Cloudflare R2)
- ✅ Team Management Service (Component 05) — multi-org membership (users belong to 50-100+ orgs)
- ✅ Customer Service (Component 06) — RFC validation, 26 tax regimes, 27 CFDI use codes
- ✅ RFC Validation Service (Component 07) — SAT SOAP web service integration
- ✅ Product/Service Management (Component 08) — 55,000+ SAT product codes, 2,800+ unit codes
- ✅ SAT Code Search AI Service (Component 09) — Python FastAPI, semantic embeddings, pgvector

### Existing AI Service Infrastructure (from Component 9)

Component 10 is added **into the existing `ai-service/` Python FastAPI microservice** — not a new service. The following infrastructure already exists and must be reused:

```
ai-service/
├── app/
│   ├── main.py              ← Register new OCR router here
│   ├── config.py            ← Add new OCR settings here
│   ├── database.py          ← Reuse for OCR result caching
│   ├── dependencies.py      ← Add OCR service dependency here
│   ├── models/
│   │   └── sat_code.py      ← Existing models (do not modify)
│   ├── routers/
│   │   ├── sat_search.py    ← Existing (do not modify)
│   │   └── health.py        ← Update to include OCR health status
│   └── services/
│       ├── embedding.py     ← Existing EmbeddingService (reuse for future)
│       └── vector_search.py ← Existing VectorSearchService (do not modify)
├── tests/                   ← Add new test files here
├── requirements.txt         ← Add new OCR dependencies here
└── Dockerfile               ← Update to install Tesseract system package
```

**Existing Redis and PostgreSQL connections are already configured** via `app/database.py` and `app/config.py`. The OCR service reuses both.

### Relevant Existing Context

**Mexican tax documents this service will process:**
- **Physical receipts (tickets)** — printed by POS systems at retail stores, restaurants, gas stations
- **Expense receipts** — hotel, travel, meals submitted for reimbursement
- **Informal invoices** — handwritten or printed invoices from small vendors not yet on CFDI
- **CFDI PDF printouts** — printed representations of electronic CFDI invoices (these have XML attached, but users may scan them instead)

**RFC format** (already validated in Component 07):
```
Persons:    4 letters + 6 digits (YYYYMMDD) + 3 alphanumeric = 13 chars
             e.g., GOMJ850101AB2
Companies:  3 letters + 6 digits (YYYYMMDD) + 3 alphanumeric = 12 chars
             e.g., SAT930101NI3
```

**Amount formats common in Mexican receipts:**
```
$1,234.56       MXN formatting with comma thousands separator
$ 1,234.56      Space after peso sign
1234.56         No formatting
$1,234          No cents
TOTAL: $1,234.56
TOTAL A PAGAR: $1,234.56
IMPORTE: $1,234.56
IVA: $197.53
SUBTOTAL: $1,037.03
```

**Date formats common in Mexican receipts:**
```
01/01/2024      DD/MM/YYYY (most common)
2024-01-01      ISO format
01-ENE-2024     Day-month abbreviation
01 de enero de 2024   Long form
```

**Future integration point:** The expense service (Component 20) will call the OCR service to auto-populate expense records when users photograph receipts. Design the API with this in mind.

---

## 📋 CURRENT TASK: Component 10 — Receipt OCR Service

Build a Receipt OCR service as a new module within the existing `ai-service/` FastAPI application. The service will:

1. Accept uploaded images (JPEG, PNG, WEBP) and PDFs
2. Preprocess images for optimal OCR accuracy (deskew, denoise, contrast enhancement)
3. Extract raw text using Tesseract OCR with Spanish language support
4. Parse structured data from the extracted text: total amount, date, vendor name, RFC
5. Return results with per-field confidence scores
6. Cache results in PostgreSQL to avoid re-processing the same document
7. Support a special endpoint for extracting data from CFDI XML files (embedded in PDFs)

---

## 🏗️ IMPLEMENTATION ORDER

Follow this exact order. **Write unit tests for each step before moving to the next.**

---

### Step 1: Dependencies & Configuration

**Update `requirements.txt`** — add these dependencies:

```
# OCR
pytesseract==0.3.10
Pillow==10.3.0
pdf2image==1.17.0
opencv-python-headless==4.9.0.80
numpy==1.26.4
# XML parsing for CFDI XML extraction
lxml==5.2.1
```

**Update `requirements-dev.txt`** — add:
```
Pillow==10.3.0   # already added above, ensure it's in dev too
```

**Update `Dockerfile`** — add Tesseract and Poppler system packages (Poppler is required by `pdf2image`):

```dockerfile
RUN apt-get update && apt-get install -y \
    build-essential \
    tesseract-ocr \
    tesseract-ocr-spa \
    tesseract-ocr-eng \
    poppler-utils \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
```

**Update `app/config.py`** — add OCR settings to the existing `Settings` class:

```python
# OCR Configuration
tesseract_cmd: str = "/usr/bin/tesseract"         # Override for local dev on macOS/Windows
ocr_language: str = "spa+eng"                      # Tesseract language codes
max_image_size: int = 4096                         # Max dimension in pixels before resizing
ocr_dpi: int = 300                                 # DPI for PDF-to-image conversion
ocr_cache_ttl: int = 86400                         # Cache OCR results 24 hours
max_file_size_mb: int = 10                         # Reject files larger than this
```

**Add database table** for OCR result caching. Create migration file `supabase/migrations/20250101000010_add_ocr_cache.sql`:

```sql
CREATE TABLE ocr_results_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash VARCHAR(64) NOT NULL UNIQUE,     -- SHA-256 of file bytes
  file_type VARCHAR(10) NOT NULL,            -- 'jpeg', 'png', 'pdf', 'xml'
  raw_text TEXT,
  extracted_data JSONB,
  confidence_score DECIMAL(4, 3),
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_ocr_cache_hash ON ocr_results_cache(file_hash);
CREATE INDEX idx_ocr_cache_expires ON ocr_results_cache(expires_at);
```

Write unit tests in `tests/test_ocr_config.py`:
- Test all new OCR settings have correct defaults
- Test settings can be overridden via environment variables
- Test `max_file_size_mb` is accessible as an integer

---

### Step 2: Data Models

**File: `app/models/receipt.py`**

```python
from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal
from datetime import date
from enum import Enum

class FileType(str, Enum):
    JPEG = "jpeg"
    PNG = "png"
    WEBP = "webp"
    PDF = "pdf"
    XML = "xml"

class ExtractedField(BaseModel):
    """A single extracted data field with its confidence score."""
    value: Optional[str]               # Raw string value as extracted
    confidence: float = Field(ge=0.0, le=1.0)   # 0.0 = not found, 1.0 = certain
    method: str                        # How it was extracted: "regex", "nlp", "position"

class ReceiptData(BaseModel):
    """
    Structured data extracted from a receipt or invoice image.
    All fields are optional — OCR may not find everything.
    """
    # Core financial fields
    total_amount: Optional[ExtractedField]    # Final amount to pay
    subtotal: Optional[ExtractedField]        # Amount before tax
    iva_amount: Optional[ExtractedField]      # IVA/tax amount
    currency: Optional[ExtractedField]        # 'MXN', 'USD', etc.

    # Document identification
    vendor_name: Optional[ExtractedField]     # Business name
    rfc: Optional[ExtractedField]             # RFC of the issuer (12-13 chars)
    receipt_number: Optional[ExtractedField]  # Folio, ticket #, or receipt number
    date: Optional[ExtractedField]            # Document date (YYYY-MM-DD normalized)

    # Address (optional, present in formal invoices)
    address: Optional[ExtractedField]

class OCRResult(BaseModel):
    """Full result returned by the OCR service."""
    file_hash: str                      # SHA-256 of processed file
    file_type: FileType
    raw_text: str                       # Full OCR text output
    extracted_data: ReceiptData
    overall_confidence: float = Field(ge=0.0, le=1.0)
    processing_time_ms: int
    cached: bool = False               # True if result was served from cache
    warnings: list[str] = []           # e.g., ["Low image quality", "RFC not found"]

class CFDIXMLData(BaseModel):
    """Structured data extracted from a CFDI XML file."""
    version: str                        # CFDI version: "4.0", "3.3"
    folio: Optional[str]
    fecha: str                          # ISO datetime
    subtotal: Decimal
    total: Decimal
    moneda: str
    tipo_cambio: Optional[Decimal]
    tipo_comprobante: str               # "I"=Ingreso, "E"=Egreso, "T"=Traslado
    emisor_rfc: str
    emisor_nombre: str
    emisor_regimen_fiscal: str
    receptor_rfc: str
    receptor_nombre: str
    receptor_uso_cfdi: str
    conceptos: list[dict]               # Line items
    uuid: Optional[str]                 # Timbre fiscal UUID
    # Tax breakdown
    total_impuestos_trasladados: Optional[Decimal]
    total_impuestos_retenidos: Optional[Decimal]
```

Write unit tests in `tests/test_receipt_models.py`:
- Test `ExtractedField` rejects confidence values outside 0.0-1.0
- Test `OCRResult` serializes to JSON correctly
- Test `ReceiptData` allows all None fields (no required fields)
- Test `CFDIXMLData` correctly types `Decimal` fields
- Test `FileType` enum validates acceptable file type strings

---

### Step 3: Image Processing Service

**File: `app/services/image_processing.py`**

```python
import cv2
import numpy as np
from PIL import Image
from typing import Union
import io

class ImageProcessingService:
    """
    Preprocesses images for optimal OCR accuracy.
    All methods accept and return PIL Image objects.
    Input images may be JPEG, PNG, or WEBP.
    """

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Full preprocessing pipeline. Applies all steps in order:
        1. convert_to_grayscale
        2. resize_image (if needed)
        3. deskew_image
        4. remove_noise
        5. enhance_contrast
        Returns the processed image ready for Tesseract.
        """
        ...

    def resize_image(
        self, image: Image.Image, max_size: int = 4096
    ) -> Image.Image:
        """
        Resize image if either dimension exceeds max_size.
        Preserves aspect ratio. Uses LANCZOS resampling.
        If image is already within bounds, returns unchanged.
        Logs a warning if original image is smaller than 300x300
        (likely too small for good OCR).
        """
        ...

    def convert_to_grayscale(self, image: Image.Image) -> Image.Image:
        """
        Convert image to grayscale (mode 'L').
        If image is already grayscale, return unchanged.
        """
        ...

    def deskew_image(self, image: Image.Image) -> Image.Image:
        """
        Detect and correct image skew using OpenCV.

        Algorithm:
        1. Convert PIL to numpy array
        2. Apply Canny edge detection
        3. Use Hough Line Transform to detect dominant line angles
        4. Calculate median angle of detected lines
        5. If angle > 0.5 degrees, rotate to correct
        6. Return corrected PIL image

        If skew detection fails for any reason, return original image unchanged
        (never raise an exception — OCR can still work on skewed images).
        Max correction angle: 45 degrees (ignore larger values as false positives).
        """
        ...

    def remove_noise(self, image: Image.Image) -> Image.Image:
        """
        Apply noise reduction using OpenCV.

        Steps:
        1. Convert PIL to numpy array
        2. Apply median blur (kernel size 3) for salt-and-pepper noise
        3. Apply morphological opening to remove small noise artifacts
        4. Return as PIL image

        Use conservative parameters — aggressive noise reduction can
        destroy thin characters in receipts.
        """
        ...

    def enhance_contrast(self, image: Image.Image) -> Image.Image:
        """
        Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization).
        Better than global histogram equalization for receipts with uneven lighting.

        Steps:
        1. Convert PIL to numpy array
        2. Apply CLAHE with clipLimit=2.0, tileGridSize=(8,8)
        3. Apply adaptive thresholding to binarize
           (cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        4. Return as PIL image
        """
        ...

    def load_image_from_bytes(self, data: bytes, file_type: str) -> Image.Image:
        """
        Load a PIL Image from raw bytes.
        Supports: jpeg, png, webp.
        Raises ValueError for unsupported types.
        """
        ...

    def pdf_to_images(self, pdf_bytes: bytes, dpi: int = 300) -> list[Image.Image]:
        """
        Convert PDF pages to a list of PIL Images using pdf2image.
        Each page becomes one image.
        Uses the configured DPI (300 recommended for OCR).
        Raises ValueError if PDF has more than 20 pages (reject large PDFs).
        """
        ...
```

Write unit tests in `tests/test_image_processing.py`:
- Test `convert_to_grayscale` returns image in mode 'L'
- Test `resize_image` does not resize images within bounds
- Test `resize_image` resizes oversized images preserving aspect ratio
- Test `deskew_image` returns original image without raising on failure
- Test `deskew_image` does not rotate if skew angle < 0.5 degrees
- Test `enhance_contrast` returns numpy-compatible array
- Test `load_image_from_bytes` raises ValueError for unsupported type
- Test `pdf_to_images` raises ValueError for PDFs exceeding 20 pages
- Test full `preprocess_image` pipeline runs without error on a sample image
- Use `PIL.Image.new('RGB', (100, 100))` as test input to avoid needing actual image files

---

### Step 4: OCR Service

**File: `app/services/ocr.py`**

```python
import pytesseract
import re
from PIL import Image
from app.services.image_processing import ImageProcessingService
from app.models.receipt import ReceiptData, ExtractedField, OCRResult, FileType
import hashlib, time

class OCRService:
    """
    Extracts text and structured data from receipt images.
    Uses Tesseract OCR with Spanish+English language support.
    """

    def __init__(self, image_processor: ImageProcessingService):
        self.image_processor = image_processor

    def compute_file_hash(self, data: bytes) -> str:
        """SHA-256 hash of file bytes, used as cache key."""
        return hashlib.sha256(data).hexdigest()

    def extract_text(self, image: Image.Image) -> tuple[str, float]:
        """
        Run Tesseract OCR on a preprocessed image.
        Language: spa+eng (Spanish primary, English fallback).
        Config: --oem 3 --psm 6 (assume uniform block of text).

        Returns:
            (raw_text, confidence_score)
            confidence_score is the mean of Tesseract's word-level
            confidence values (0-100 mapped to 0.0-1.0).
            Words with confidence < 30 are excluded from the mean.
        """
        ...

    def preprocess_and_extract(self, image: Image.Image) -> tuple[str, float]:
        """
        Full pipeline: preprocess image then extract text.
        Convenience method combining image_processor and extract_text.
        """
        ...

    def parse_receipt_data(self, text: str) -> ReceiptData:
        """
        Parse structured fields from raw OCR text.
        Calls all extract_* methods and assembles a ReceiptData object.
        """
        return ReceiptData(
            total_amount=self.extract_amount(text),
            subtotal=self.extract_subtotal(text),
            iva_amount=self.extract_iva(text),
            currency=self.extract_currency(text),
            vendor_name=self.extract_vendor(text),
            rfc=self.extract_rfc(text),
            receipt_number=self.extract_receipt_number(text),
            date=self.extract_date(text),
            address=self.extract_address(text),
        )

    def extract_rfc(self, text: str) -> ExtractedField:
        """
        Extract Mexican RFC from text.

        RFC pattern (from Component 07):
        - Companies: 3 letters + 6 digits + 3 alphanumeric = 12 chars
        - Persons: 4 letters + 6 digits + 3 alphanumeric = 13 chars
        - Regex: [A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}

        Search in lines containing: RFC, R.F.C., RFC:
        If multiple RFCs found, prefer the one on the issuer line
        (look for "EMISOR", "RFC DEL EMISOR").

        Confidence:
        - 1.0 if found next to keyword "RFC"
        - 0.8 if found standalone matching full pattern
        - 0.0 if not found (return ExtractedField(value=None, confidence=0.0, method="regex"))
        """
        ...

    def extract_amount(self, text: str) -> ExtractedField:
        """
        Extract the total payment amount.

        Search priority (highest confidence first):
        1. Lines matching: TOTAL, TOTAL A PAGAR, GRAN TOTAL (confidence 0.9)
        2. Lines matching: IMPORTE TOTAL, MONTO TOTAL (confidence 0.8)
        3. Lines matching: IMPORTE (confidence 0.6)
        4. Largest currency amount on the page (confidence 0.4)

        Amount pattern: [$]?\s*[\d,]+\.?\d{0,2}
        Normalize: remove $ and commas, convert to string with 2 decimal places.
        If multiple candidates found, return the highest confidence one.

        Return value as string (e.g., "1234.56") — caller handles Decimal conversion.
        """
        ...

    def extract_subtotal(self, text: str) -> ExtractedField:
        """
        Extract the subtotal (before tax).
        Look for lines containing: SUBTOTAL, SUB TOTAL, NETO
        Same pattern as extract_amount.
        """
        ...

    def extract_iva(self, text: str) -> ExtractedField:
        """
        Extract IVA/tax amount.
        Look for lines containing: IVA, I.V.A., IMPUESTO, TAX
        Same pattern as extract_amount.
        """
        ...

    def extract_currency(self, text: str) -> ExtractedField:
        """
        Extract currency.
        Defaults to "MXN" with confidence 0.7 if not explicitly stated.
        Look for: MXN, USD, PESOS, DÓLARES, DOLARES.
        If USD or DOLARES found, return "USD" with confidence 0.9.
        """
        ...

    def extract_date(self, text: str) -> ExtractedField:
        """
        Extract and normalize document date.

        Supported formats:
        - DD/MM/YYYY → normalize to YYYY-MM-DD
        - YYYY-MM-DD → already normalized
        - DD-MMM-YYYY (e.g., 01-ENE-2024) → normalize to YYYY-MM-DD
        - DD de MMMM de YYYY (e.g., 01 de enero de 2024) → normalize

        Spanish month abbreviations:
        ENE, FEB, MAR, ABR, MAY, JUN, JUL, AGO, SEP, OCT, NOV, DIC

        Look for lines containing: FECHA, DATE, EMISION, F.
        Confidence 0.9 if found near keyword, 0.7 if standalone date pattern.
        Return normalized value as "YYYY-MM-DD" string.
        Reject dates before 1990 or in the future (likely OCR errors).
        """
        ...

    def extract_vendor(self, text: str) -> ExtractedField:
        """
        Extract vendor/business name.

        Strategy:
        1. Check first 5 non-empty lines of the text (business name is almost
           always at the top of a receipt).
        2. Skip lines that are: pure numbers, dates, RFCs, phone numbers,
           or single words less than 3 characters.
        3. Return the best candidate with confidence 0.6.
        4. If nothing useful found: return ExtractedField(value=None, confidence=0.0, ...)

        This is the hardest field to extract reliably — be conservative.
        """
        ...

    def extract_receipt_number(self, text: str) -> ExtractedField:
        """
        Extract receipt/folio number.
        Look for lines containing: FOLIO, TICKET, RECIBO, FACTURA, NO., #, NUM
        Extract the alphanumeric value following the keyword.
        """
        ...

    def extract_address(self, text: str) -> ExtractedField:
        """
        Attempt to extract vendor address.
        Look for lines containing street indicators: CALLE, AV., BLVD., COL., C.P., CP
        Combine consecutive address lines into a single string.
        Confidence 0.6 if found, 0.0 if not.
        """
        ...
```

Write unit tests in `tests/test_ocr_service.py`:

Test each extraction method with realistic Mexican receipt text. Include the following sample texts in `tests/conftest.py` as fixtures:

```python
SAMPLE_RECEIPT_TEXT = """
OXXO S.A. DE C.V.
RFC: OXX0000000000
CALLE HIDALGO 123, COL. CENTRO
CIUDAD DE MEXICO, CP 06600

FECHA: 15/03/2024
TICKET: 0012345

REFRESCOS            $45.00
SNACKS               $32.50
SUBTOTAL            $77.50
IVA 16%             $12.40
TOTAL               $89.90

GRACIAS POR SU COMPRA
"""

SAMPLE_FORMAL_INVOICE_TEXT = """
EMPRESA CONSULTORA S.A. DE C.V.
RFC: ECS200101ABC
AV. REFORMA 500, PISO 10
CIUDAD DE MEXICO

FACTURA: F-2024-0089
FECHA: 01 de marzo de 2024
CLIENTE: RFC: GOMJ850101AB2

DESCRIPCION                 IMPORTE
Servicios de consultoria    $10,000.00
SUBTOTAL:                   $10,000.00
IVA (16%):                   $1,600.00
TOTAL A PAGAR:              $11,600.00
"""
```

Unit tests to write:
- Test `extract_rfc` finds RFC in `SAMPLE_RECEIPT_TEXT`
- Test `extract_rfc` finds both RFCs in `SAMPLE_FORMAL_INVOICE_TEXT` and returns issuer
- Test `extract_rfc` returns confidence 0.0 when no RFC in text
- Test `extract_amount` finds `$89.90` from `SAMPLE_RECEIPT_TEXT`
- Test `extract_amount` finds `$11,600.00` from `SAMPLE_FORMAL_INVOICE_TEXT`
- Test `extract_amount` handles amounts with commas (`$1,234.56` → `"1234.56"`)
- Test `extract_date` parses `15/03/2024` → `"2024-03-15"`
- Test `extract_date` parses `01 de marzo de 2024` → `"2024-03-01"`
- Test `extract_date` rejects dates before 1990
- Test `extract_vendor` returns first meaningful line (skipping blanks/numbers)
- Test `extract_currency` defaults to "MXN" when not specified
- Test `parse_receipt_data` returns a `ReceiptData` with all optional fields populated from sample text
- Test `extract_text` is called with correct Tesseract config (`--psm 6`, `spa+eng`) — mock pytesseract

---

### Step 5: CFDI XML Extractor

**File: `app/services/cfdi_xml_extractor.py`**

CFDI PDFs contain an embedded XML file. Some users will upload these PDFs or the raw XML file. This service parses them directly without OCR (much higher accuracy).

```python
from lxml import etree
from app.models.receipt import CFDIXMLData
from decimal import Decimal
from typing import Optional

# CFDI 4.0 namespace
CFDI_NS = "http://www.sat.gob.mx/cfd/4"
# CFDI 3.3 namespace
CFDI_NS_33 = "http://www.sat.gob.mx/cfd/3"
# Timbre fiscal namespace
TIMBRE_NS = "http://www.sat.gob.mx/TimbreFiscalDigital"

class CFDIXMLExtractor:
    """
    Parses CFDI XML files (versions 3.3 and 4.0) and extracts structured data.
    Does NOT use OCR — parses the XML directly.
    """

    def extract_from_xml_bytes(self, xml_bytes: bytes) -> CFDIXMLData:
        """
        Parse raw XML bytes and return structured CFDIXMLData.
        Supports CFDI 3.3 and 4.0.
        Raises ValueError if the XML is not a valid CFDI document.
        """
        ...

    def extract_from_pdf(self, pdf_bytes: bytes) -> Optional[CFDIXMLData]:
        """
        Attempt to extract embedded CFDI XML from a PDF file.

        CFDI PDFs contain the XML as an attachment. Strategy:
        1. Use PyMuPDF (fitz) or pdfminer to extract embedded files
        2. Look for attachments with .xml extension
        3. Parse the first found XML file as CFDI
        4. Return None if no XML attachment found (caller should fall back to OCR)

        Note: Add `pymupdf==1.24.3` to requirements.txt for this function.
        """
        ...

    def _detect_version(self, root: etree._Element) -> str:
        """
        Detect CFDI version from XML namespace or Version attribute.
        Returns "4.0" or "3.3". Raises ValueError for unknown versions.
        """
        ...

    def _extract_conceptos(self, root: etree._Element, ns: str) -> list[dict]:
        """
        Extract all Concepto elements as a list of dicts.
        Each dict includes: ClaveProdServ, ClaveUnidad, Descripcion,
        Cantidad, ValorUnitario, Importe, Descuento (optional), ObjetoImp.
        """
        ...
```

Add `pymupdf==1.24.3` to `requirements.txt`.

Write unit tests in `tests/test_cfdi_xml_extractor.py`:

Include a minimal valid CFDI 4.0 XML string as a fixture in `conftest.py`:

```python
SAMPLE_CFDI_40_XML = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0" Folio="123" Fecha="2024-03-01T10:00:00"
  SubTotal="10000.00" Total="11600.00" Moneda="MXN"
  TipoDeComprobante="I">
  <cfdi:Emisor Rfc="ECS200101ABC" Nombre="EMPRESA CONSULTORA"
    RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="GOMJ850101AB2" Nombre="JUAN GOMEZ"
    UsoCFDI="G03" RegimenFiscalReceptor="626"
    DomicilioFiscalReceptor="06600"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81112100" ClaveUnidad="E48"
      Descripcion="Consultoria" Cantidad="1"
      ValorUnitario="10000.00" Importe="10000.00" ObjetoImp="02"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.00" Impuesto="002"
        TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>"""
```

Unit tests to write:
- Test `extract_from_xml_bytes` parses `SAMPLE_CFDI_40_XML` correctly
- Test `extract_from_xml_bytes` returns correct `emisor_rfc`, `receptor_rfc`, `total`
- Test `extract_from_xml_bytes` extracts one concepto correctly
- Test `_detect_version` returns "4.0" for CFDI 4.0 XML
- Test `extract_from_xml_bytes` raises `ValueError` for invalid XML
- Test `extract_from_xml_bytes` raises `ValueError` for XML that is not a CFDI document
- Test `extract_from_pdf` returns `None` when PDF has no XML attachment (mock pdf)

---

### Step 6: OCR Router

**File: `app/routers/ocr.py`**

```python
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from app.models.receipt import OCRResult, CFDIXMLData, FileType
from app.services.ocr import OCRService
from app.services.cfdi_xml_extractor import CFDIXMLExtractor
from app.services.image_processing import ImageProcessingService

router = APIRouter(tags=["OCR"])

ALLOWED_MIME_TYPES = {
    "image/jpeg": FileType.JPEG,
    "image/png": FileType.PNG,
    "image/webp": FileType.WEBP,
    "application/pdf": FileType.PDF,
}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB

@router.post("/ocr/receipt", response_model=OCRResult)
async def extract_receipt(
    file: UploadFile = File(...),
    db = Depends(get_db),
    ocr_service: OCRService = Depends(get_ocr_service),
    image_processor: ImageProcessingService = Depends(get_image_processor),
) -> OCRResult:
    """
    Extract structured data from a receipt image or PDF.

    Accepted types: JPEG, PNG, WEBP, PDF
    Max file size: 10MB

    Processing flow:
    1. Validate file type and size
    2. Compute SHA-256 hash → check PostgreSQL cache
    3. If cached: return cached result (with cached=True)
    4. If PDF: convert first page to image (multi-page PDFs use only page 1)
    5. Preprocess image (deskew, denoise, contrast)
    6. Run Tesseract OCR → raw text + confidence
    7. Parse structured data from text
    8. Store result in cache
    9. Return OCRResult

    Returns warnings list if:
    - Overall confidence < 0.5 ("Low image quality — consider retaking photo")
    - RFC not found ("RFC could not be extracted")
    - Total amount not found ("Total amount could not be extracted")
    """
    ...

@router.post("/ocr/cfdi-xml", response_model=CFDIXMLData)
async def extract_invoice_xml(
    file: UploadFile = File(...),
    db = Depends(get_db),
    extractor: CFDIXMLExtractor = Depends(get_cfdi_extractor),
) -> CFDIXMLData:
    """
    Extract structured data from a CFDI XML file or a PDF containing an embedded CFDI XML.

    Accepted types: .xml, .pdf

    Processing flow:
    1. Validate file type (.xml or .pdf only)
    2. If .xml: parse directly
    3. If .pdf: attempt to extract embedded XML attachment
       - If XML found: parse it
       - If no XML: return 422 with message "No XML attachment found in PDF.
         Use /ocr/receipt for PDF receipts without embedded XML."
    4. Validate extracted data is a valid CFDI
    5. Return CFDIXMLData

    This endpoint does NOT use OCR. It parses the XML directly.
    Accuracy is near 100% (unlike OCR-based extraction).
    """
    ...

@router.post("/ocr/validate", response_model=dict)
async def validate_extraction(
    data: dict,
) -> dict:
    """
    Validate an OCR extraction result.
    Useful for the frontend to check if manually-corrected fields are valid.

    Input: dict with any subset of ReceiptData fields
    Output: {
      "valid": bool,
      "errors": { "rfc": "Invalid RFC format", ... }
    }

    Validates:
    - RFC format (if present) using Component 07 regex
    - Amount is a valid positive number (if present)
    - Date is a valid date in YYYY-MM-DD format (if present)
    """
    ...
```

**Update `app/main.py`** to register the new router:

```python
from app.routers import sat_search, health, ocr  # add ocr

app.include_router(ocr.router, prefix="/api/v1")
```

**Update `app/routers/health.py`** to include OCR health status:

```python
# Add to the existing health check response:
"tesseract_available": bool  # True if pytesseract can find Tesseract binary
"ocr_languages_available": list[str]  # e.g., ["spa", "eng"]
```

**Update `app/dependencies.py`** to add:

```python
def get_ocr_service() -> OCRService:
    return OCRService(image_processor=ImageProcessingService())

def get_image_processor() -> ImageProcessingService:
    return ImageProcessingService()

def get_cfdi_extractor() -> CFDIXMLExtractor:
    return CFDIXMLExtractor()
```

Write unit tests in `tests/test_ocr_router.py` using FastAPI `TestClient`:
- Test `POST /api/v1/ocr/receipt` with a valid PNG returns 200
- Test `POST /api/v1/ocr/receipt` with a file exceeding 10MB returns 413
- Test `POST /api/v1/ocr/receipt` with an unsupported file type (e.g., `.txt`) returns 415
- Test `POST /api/v1/ocr/receipt` returns cached result on second upload of same file
- Test `POST /api/v1/ocr/receipt` sets `cached=True` on second call
- Test `POST /api/v1/ocr/cfdi-xml` with valid XML bytes returns 200 with correct RFC
- Test `POST /api/v1/ocr/cfdi-xml` with a PDF having no XML attachment returns 422
- Test `POST /api/v1/ocr/cfdi-xml` with invalid XML returns 422
- Test `POST /api/v1/ocr/validate` with valid RFC returns `{"valid": true, "errors": {}}`
- Test `POST /api/v1/ocr/validate` with malformed RFC returns `{"valid": false, "errors": {"rfc": "..."}}`
- Test `GET /api/v1/health` now includes `tesseract_available` field

In tests, mock `pytesseract.image_to_data` to return a fixed result so tests don't require Tesseract installed.

---

### Step 7: Next.js Integration

Add a client in the Next.js app to call the OCR endpoints.

**File: `apps/web/lib/expenses/ocr-client.ts`**

(This lives in `lib/expenses/` because Component 20 — Expense Service — is the primary consumer. Creating it now so it's ready.)

```typescript
/**
 * Client for the Python AI OCR microservice.
 * Used by the expense service to auto-populate expense records from receipt photos.
 */

export interface ExtractedField {
  value: string | null;
  confidence: number;   // 0.0 - 1.0
  method: string;
}

export interface ReceiptData {
  total_amount: ExtractedField | null;
  subtotal: ExtractedField | null;
  iva_amount: ExtractedField | null;
  currency: ExtractedField | null;
  vendor_name: ExtractedField | null;
  rfc: ExtractedField | null;
  receipt_number: ExtractedField | null;
  date: ExtractedField | null;
  address: ExtractedField | null;
}

export interface OCRResult {
  file_hash: string;
  file_type: string;
  raw_text: string;
  extracted_data: ReceiptData;
  overall_confidence: number;
  processing_time_ms: number;
  cached: boolean;
  warnings: string[];
}

export interface CFDIXMLData {
  version: string;
  folio: string | null;
  fecha: string;
  subtotal: string;
  total: string;
  moneda: string;
  emisor_rfc: string;
  emisor_nombre: string;
  receptor_rfc: string;
  receptor_nombre: string;
  receptor_uso_cfdi: string;
  conceptos: Array<Record<string, string>>;
  uuid: string | null;
}

export class OCRServiceUnavailableError extends Error {
  constructor() {
    super("OCR service is unavailable");
    this.name = "OCRServiceUnavailableError";
  }
}

/**
 * Upload a receipt image or PDF and extract structured data.
 * Throws OCRServiceUnavailableError if the AI service is unreachable.
 */
export async function extractReceiptData(file: File): Promise<OCRResult> { ... }

/**
 * Upload a CFDI XML file or PDF with embedded XML and parse the CFDI.
 * More accurate than OCR for electronic invoices.
 * Throws OCRServiceUnavailableError if the AI service is unreachable.
 */
export async function extractCFDIXML(file: File): Promise<CFDIXMLData> { ... }

/**
 * Validate extracted OCR data fields.
 */
export async function validateExtraction(
  data: Partial<ReceiptData>
): Promise<{ valid: boolean; errors: Record<string, string> }> { ... }
```

Write unit tests in `apps/web/lib/expenses/__tests__/ocr-client.test.ts`:
- Test `extractReceiptData` returns typed `OCRResult` on success
- Test `extractReceiptData` throws `OCRServiceUnavailableError` when service unreachable
- Test `extractCFDIXML` returns typed `CFDIXMLData` on success
- Test `validateExtraction` returns `{valid: true, errors: {}}` for valid data
- Test file size is checked client-side before upload (reject files > 10MB before network call)

---

## 🔑 KEY TECHNICAL DECISIONS

**Why Tesseract over cloud OCR (Google Vision / AWS Textract):**
- Zero per-request cost — critical for a platform targeting cost-sensitive Mexican SMEs
- No data privacy concerns (receipts may contain sensitive RFC and financial data)
- Works offline/air-gapped
- Sufficient accuracy for printed receipts with preprocessing
- Cloud OCR can be added later as an optional upgrade path — keep the service interface the same

**Why `--psm 6` (uniform block of text):**
- Receipts are typically single-column text
- PSM 6 gives best results for structured but variable-length text
- Alternative PSM 11 (sparse text) as fallback for low-quality images is worth exploring in future iterations

**Why cache in PostgreSQL (not only Redis):**
- OCR is expensive (1-3 seconds per image) — results should persist across service restarts
- Redis cache for hot path (recently uploaded files)
- PostgreSQL as the durable cache that survives restarts
- Hash-based deduplication: same receipt uploaded twice → returns cached result

**PDF handling strategy:**
- Try XML extraction first for PDFs (near-100% accuracy for CFDI PDFs)
- Fall back to OCR on first PDF page only for non-CFDI PDFs
- Reject PDFs > 20 pages (expense receipts are never that long)

**RFC extraction confidence levels:**
- Adjacent to "RFC:" keyword → 1.0 (definitive)
- Pattern match only → 0.8 (likely correct)
- This mirrors the confidence scoring used by Component 07 for RFC validation

---

## 📐 EXPECTED BEHAVIOR

```python
# Example 1: JPEG receipt image
POST /api/v1/ocr/receipt
Content-Type: multipart/form-data
[JPEG file of an OXXO receipt]

→ {
    "file_hash": "abc123...",
    "file_type": "jpeg",
    "raw_text": "OXXO S.A. DE C.V.\nRFC: OXX0000000000\n...",
    "extracted_data": {
      "total_amount": {"value": "89.90", "confidence": 0.9, "method": "regex"},
      "rfc": {"value": "OXX0000000000", "confidence": 1.0, "method": "regex"},
      "date": {"value": "2024-03-15", "confidence": 0.9, "method": "regex"},
      "vendor_name": {"value": "OXXO S.A. DE C.V.", "confidence": 0.6, "method": "position"},
      "currency": {"value": "MXN", "confidence": 0.7, "method": "default"}
    },
    "overall_confidence": 0.82,
    "processing_time_ms": 1240,
    "cached": false,
    "warnings": []
  }

# Example 2: Same file uploaded again
POST /api/v1/ocr/receipt [same file]
→ same response but "cached": true, processing_time_ms: 5

# Example 3: Low quality image
POST /api/v1/ocr/receipt [blurry photo]
→ {
    "overall_confidence": 0.38,
    "warnings": [
      "Low image quality — consider retaking photo",
      "Total amount could not be extracted"
    ]
  }

# Example 4: CFDI XML file
POST /api/v1/ocr/cfdi-xml [.xml file]
→ {
    "version": "4.0",
    "emisor_rfc": "ECS200101ABC",
    "total": "11600.00",
    "conceptos": [{"ClaveProdServ": "81112100", ...}]
  }

# Example 5: PDF without XML attachment
POST /api/v1/ocr/cfdi-xml [PDF with no embedded XML]
→ 422 Unprocessable Entity
  {"detail": "No XML attachment found in PDF. Use /ocr/receipt for PDF receipts without embedded XML."}
```

---

## 🧪 TESTING REQUIREMENTS

All tests go in `ai-service/tests/`. Mark tests requiring real Tesseract or a real database with `@pytest.mark.integration` — these run separately from unit tests.

**Coverage targets:**
- `app/services/image_processing.py` → ≥ 85% coverage
- `app/services/ocr.py` → ≥ 90% coverage
- `app/services/cfdi_xml_extractor.py` → ≥ 90% coverage
- `app/routers/ocr.py` → ≥ 85% coverage
- `apps/web/lib/expenses/ocr-client.ts` → ≥ 85% coverage

**Update `tests/conftest.py`** (do not replace — add to existing fixtures):
- Add `SAMPLE_RECEIPT_TEXT` string fixture (provided in Step 4)
- Add `SAMPLE_FORMAL_INVOICE_TEXT` string fixture (provided in Step 4)
- Add `SAMPLE_CFDI_40_XML` string fixture (provided in Step 5)
- Add `mock_ocr_service` fixture that returns a fixed `OCRResult`
- Add `mock_pytesseract` fixture that patches `pytesseract.image_to_data` and `pytesseract.image_to_string`

**Run tests:**
```bash
# Unit tests only (no Tesseract required)
cd ai-service
pytest tests/ -v -m "not integration" --cov=app --cov-report=term-missing

# All tests (requires Tesseract installed)
pytest tests/ -v --cov=app --cov=scripts --cov-report=term-missing
```

---

## 📝 COMPLETION SUMMARY REQUIREMENT

When you have finished implementing all steps, write a **Completion Summary** at the end of your response with the following sections:

### Component 10 Completion Summary

**1. What Was Built**
List every file created or modified with a one-line description.

**2. Architecture Overview**
How image preprocessing → Tesseract OCR → structured parsing → caching fits together. How the CFDI XML path bypasses OCR entirely. How the Next.js client integrates.

**3. Database Changes**
Table created: `ocr_results_cache`. Columns, indexes, migration file name.

**4. API Endpoints**
Table: method, path, accepted file types, description.

**5. Extraction Accuracy Notes**
For each extracted field (RFC, amount, date, vendor), describe the extraction strategy and expected accuracy range on clean vs. low-quality receipts.

**6. Test Coverage**
List each test file and test count. Total new tests added by this component.

**7. Integration Points**
How Component 10 connects to:
- Component 09 (ai-service infrastructure reused)
- Component 20 (Expense Service — primary future consumer via `ocr-client.ts`)
- Component 27 (WhatsApp Bot — user photographs receipt, bot processes it)

**8. Environment Variables Added**
New env vars with descriptions and example values.

**9. Limitations & Future Improvements**
Be specific: handwritten receipts, very dark/overexposed images, multi-column layouts, GPU acceleration for Tesseract, cloud OCR upgrade path.

**10. How to Verify It Works**
Step-by-step curl commands to confirm the service is running and returning correct results after deployment.

---

## ✅ DEFINITION OF DONE

Component 10 is complete when:

- [ ] All new files exist in the specified locations
- [ ] `Dockerfile` updated with `tesseract-ocr`, `tesseract-ocr-spa`, and `poppler-utils`
- [ ] `requirements.txt` updated with all OCR dependencies
- [ ] `supabase/migrations/20250101000010_add_ocr_cache.sql` exists
- [ ] `POST /api/v1/ocr/receipt` accepts JPEG, PNG, WEBP, PDF and returns `OCRResult`
- [ ] `POST /api/v1/ocr/cfdi-xml` accepts XML and PDF and returns `CFDIXMLData`
- [ ] Cache works: uploading the same file twice returns `cached: true` on second call
- [ ] RFC is correctly extracted from `SAMPLE_RECEIPT_TEXT` fixture with confidence ≥ 0.8
- [ ] Total amount is correctly extracted from `SAMPLE_RECEIPT_TEXT` fixture
- [ ] Date is correctly normalized to `YYYY-MM-DD` from `DD/MM/YYYY` format
- [ ] `SAMPLE_CFDI_40_XML` is parsed correctly with all fields populated
- [ ] `GET /health` now includes `tesseract_available` field
- [ ] `apps/web/lib/expenses/ocr-client.ts` exists with `OCRServiceUnavailableError`
- [ ] All unit tests pass: `pytest tests/ -v -m "not integration"`
- [ ] Coverage targets met for all new files
- [ ] `README.md` updated with OCR endpoint documentation
- [ ] Completion Summary written at the end of the response
