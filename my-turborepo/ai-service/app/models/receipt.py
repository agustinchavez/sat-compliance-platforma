"""
Receipt OCR data models.
Component 10: Receipt OCR Service
"""

from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal
from enum import Enum


class FileType(str, Enum):
    """Supported file types for OCR processing."""
    JPEG = "jpeg"
    PNG = "png"
    WEBP = "webp"
    PDF = "pdf"
    XML = "xml"


class ExtractedField(BaseModel):
    """A single extracted data field with its confidence score."""
    value: Optional[str] = None  # Raw string value as extracted
    confidence: float = Field(ge=0.0, le=1.0)  # 0.0 = not found, 1.0 = certain
    method: str  # How it was extracted: "regex", "nlp", "position", "default"


class ReceiptData(BaseModel):
    """
    Structured data extracted from a receipt or invoice image.
    All fields are optional — OCR may not find everything.
    """
    # Core financial fields
    total_amount: Optional[ExtractedField] = None  # Final amount to pay
    subtotal: Optional[ExtractedField] = None  # Amount before tax
    iva_amount: Optional[ExtractedField] = None  # IVA/tax amount
    currency: Optional[ExtractedField] = None  # 'MXN', 'USD', etc.

    # Document identification
    vendor_name: Optional[ExtractedField] = None  # Business name
    rfc: Optional[ExtractedField] = None  # RFC of the issuer (12-13 chars)
    receipt_number: Optional[ExtractedField] = None  # Folio, ticket #, or receipt number
    date: Optional[ExtractedField] = None  # Document date (YYYY-MM-DD normalized)

    # Address (optional, present in formal invoices)
    address: Optional[ExtractedField] = None


class OCRResult(BaseModel):
    """Full result returned by the OCR service."""
    file_hash: str  # SHA-256 of processed file
    file_type: FileType
    raw_text: str  # Full OCR text output
    extracted_data: ReceiptData
    overall_confidence: float = Field(ge=0.0, le=1.0)
    processing_time_ms: int
    cached: bool = False  # True if result was served from cache
    warnings: list[str] = []  # e.g., ["Low image quality", "RFC not found"]


class CFDIXMLData(BaseModel):
    """Structured data extracted from a CFDI XML file."""
    version: str  # CFDI version: "4.0", "3.3"
    folio: Optional[str] = None
    fecha: str  # ISO datetime
    subtotal: Decimal
    total: Decimal
    moneda: str
    tipo_cambio: Optional[Decimal] = None
    tipo_comprobante: str  # "I"=Ingreso, "E"=Egreso, "T"=Traslado
    emisor_rfc: str
    emisor_nombre: str
    emisor_regimen_fiscal: str
    receptor_rfc: str
    receptor_nombre: str
    receptor_uso_cfdi: str
    conceptos: list[dict]  # Line items
    uuid: Optional[str] = None  # Timbre fiscal UUID
    # Tax breakdown
    total_impuestos_trasladados: Optional[Decimal] = None
    total_impuestos_retenidos: Optional[Decimal] = None


class OCRValidationResult(BaseModel):
    """Result of validating OCR extraction data."""
    valid: bool
    errors: dict[str, str] = {}  # field_name -> error message
