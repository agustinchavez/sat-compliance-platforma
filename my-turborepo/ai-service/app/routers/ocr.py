"""
OCR Router - FastAPI endpoints for receipt OCR processing.

Provides endpoints for:
- Processing receipt images (JPEG, PNG, WebP)
- Processing PDF documents
- Processing CFDI XML files
"""

import logging
import time
import hashlib
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.config import get_settings
from app.models.receipt import (
    OCRResult,
    FileType,
    ReceiptData,
    CFDIXMLData,
    ExtractedField,
)
from app.services.image_processing import ImageProcessingService
from app.services.ocr import OCRService
from app.services.cfdi_extractor import CFDIExtractor

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/ocr", tags=["OCR"])

# Initialize services
image_processor = ImageProcessingService()
ocr_service = OCRService()
cfdi_extractor = CFDIExtractor()

# File type mappings
SUPPORTED_IMAGE_TYPES = {
    "image/jpeg": FileType.JPEG,
    "image/jpg": FileType.JPEG,
    "image/png": FileType.PNG,
    "image/webp": FileType.WEBP,
}

SUPPORTED_DOCUMENT_TYPES = {
    "application/pdf": FileType.PDF,
    "text/xml": FileType.XML,
    "application/xml": FileType.XML,
}

MAX_FILE_SIZE_BYTES = settings.max_file_size_mb * 1024 * 1024


def _get_file_type(content_type: str, filename: str) -> FileType:
    """Determine file type from content type or filename extension."""
    # Try content type first
    if content_type in SUPPORTED_IMAGE_TYPES:
        return SUPPORTED_IMAGE_TYPES[content_type]
    if content_type in SUPPORTED_DOCUMENT_TYPES:
        return SUPPORTED_DOCUMENT_TYPES[content_type]

    # Fall back to extension
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    extension_map = {
        'jpg': FileType.JPEG,
        'jpeg': FileType.JPEG,
        'png': FileType.PNG,
        'webp': FileType.WEBP,
        'pdf': FileType.PDF,
        'xml': FileType.XML,
    }

    if ext in extension_map:
        return extension_map[ext]

    raise ValueError(f"Unsupported file type: {content_type} ({filename})")


async def _check_cache(
    db: AsyncSession,
    file_hash: str
) -> Optional[dict]:
    """Check if OCR result is cached in database."""
    try:
        result = await db.execute(
            text("""
                SELECT raw_text, extracted_data, confidence_score
                FROM ocr_results_cache
                WHERE file_hash = :hash AND expires_at > NOW()
            """),
            {"hash": file_hash}
        )
        row = result.fetchone()
        if row:
            return {
                "raw_text": row[0],
                "extracted_data": row[1],
                "confidence_score": row[2],
            }
    except Exception as e:
        logger.warning(f"Cache lookup failed: {e}")
    return None


async def _save_to_cache(
    db: AsyncSession,
    file_hash: str,
    raw_text: str,
    extracted_data: dict,
    confidence_score: float
) -> None:
    """Save OCR result to cache."""
    try:
        expires_at = datetime.utcnow() + timedelta(seconds=settings.ocr_cache_ttl)
        await db.execute(
            text("""
                INSERT INTO ocr_results_cache
                (file_hash, raw_text, extracted_data, confidence_score, expires_at)
                VALUES (:hash, :text, :data::jsonb, :confidence, :expires)
                ON CONFLICT (file_hash)
                DO UPDATE SET
                    raw_text = :text,
                    extracted_data = :data::jsonb,
                    confidence_score = :confidence,
                    expires_at = :expires,
                    updated_at = NOW()
            """),
            {
                "hash": file_hash,
                "text": raw_text,
                "data": extracted_data,
                "confidence": confidence_score,
                "expires": expires_at,
            }
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"Cache save failed: {e}")


@router.post("/process", response_model=OCRResult)
async def process_receipt(
    file: UploadFile = File(...),
    use_cache: bool = Query(True, description="Use cached results if available"),
    db: AsyncSession = Depends(get_db),
) -> OCRResult:
    """
    Process a receipt image or document and extract structured data.

    Accepts:
    - Images: JPEG, PNG, WebP
    - Documents: PDF (max 20 pages)
    - CFDI: XML files

    Returns extracted receipt data including amounts, RFC, dates, etc.
    """
    start_time = time.time()
    warnings = []

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.max_file_size_mb}MB"
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Determine file type
    try:
        file_type = _get_file_type(file.content_type or "", file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Compute file hash for caching
    file_hash = ocr_service.compute_file_hash(content)

    # Check cache
    if use_cache:
        cached = await _check_cache(db, file_hash)
        if cached:
            logger.info(f"Cache hit for file hash: {file_hash[:16]}...")
            processing_time = int((time.time() - start_time) * 1000)

            # Reconstruct ReceiptData from cached JSON
            extracted_data = _dict_to_receipt_data(cached["extracted_data"])

            return OCRResult(
                file_hash=file_hash,
                file_type=file_type,
                raw_text=cached["raw_text"],
                extracted_data=extracted_data,
                overall_confidence=cached["confidence_score"],
                processing_time_ms=processing_time,
                cached=True,
                warnings=["Result from cache"],
            )

    # Process based on file type
    if file_type == FileType.XML:
        return await _process_xml(content, file_hash, file_type, start_time, db)
    elif file_type == FileType.PDF:
        return await _process_pdf(content, file_hash, file_type, start_time, db, warnings)
    else:
        return await _process_image(content, file_hash, file_type, start_time, db, warnings)


async def _process_image(
    content: bytes,
    file_hash: str,
    file_type: FileType,
    start_time: float,
    db: AsyncSession,
    warnings: list,
) -> OCRResult:
    """Process an image file with OCR."""
    try:
        # Load and preprocess image
        image = image_processor.load_image_from_bytes(content, file_type.value)
        processed_image = image_processor.preprocess_image(image)

        # Extract text
        raw_text, confidence = ocr_service.preprocess_and_extract(processed_image)

        if not raw_text.strip():
            warnings.append("No text detected in image")

        # Parse structured data
        extracted_data = ocr_service.parse_receipt_data(raw_text)
        overall_confidence = ocr_service._calculate_overall_confidence(extracted_data)

        # Save to cache
        extracted_dict = _receipt_data_to_dict(extracted_data)
        await _save_to_cache(db, file_hash, raw_text, extracted_dict, overall_confidence)

        processing_time = int((time.time() - start_time) * 1000)

        return OCRResult(
            file_hash=file_hash,
            file_type=file_type,
            raw_text=raw_text,
            extracted_data=extracted_data,
            overall_confidence=overall_confidence,
            processing_time_ms=processing_time,
            cached=False,
            warnings=warnings if warnings else None,
        )

    except Exception as e:
        logger.error(f"Image processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


async def _process_pdf(
    content: bytes,
    file_hash: str,
    file_type: FileType,
    start_time: float,
    db: AsyncSession,
    warnings: list,
) -> OCRResult:
    """Process a PDF file with OCR."""
    try:
        # Convert PDF to images
        images = image_processor.pdf_to_images(content)

        if not images:
            raise HTTPException(status_code=400, detail="Could not extract images from PDF")

        if len(images) > 1:
            warnings.append(f"PDF has {len(images)} pages, processing all")

        # Process each page and combine text
        all_text = []
        total_confidence = 0.0

        for i, image in enumerate(images):
            processed = image_processor.preprocess_image(image)
            text, confidence = ocr_service.preprocess_and_extract(processed)
            all_text.append(f"--- Page {i + 1} ---\n{text}")
            total_confidence += confidence

        raw_text = "\n\n".join(all_text)
        avg_confidence = total_confidence / len(images) if images else 0.0

        # Parse combined text
        extracted_data = ocr_service.parse_receipt_data(raw_text)
        overall_confidence = ocr_service._calculate_overall_confidence(extracted_data)

        # Save to cache
        extracted_dict = _receipt_data_to_dict(extracted_data)
        await _save_to_cache(db, file_hash, raw_text, extracted_dict, overall_confidence)

        processing_time = int((time.time() - start_time) * 1000)

        return OCRResult(
            file_hash=file_hash,
            file_type=file_type,
            raw_text=raw_text,
            extracted_data=extracted_data,
            overall_confidence=overall_confidence,
            processing_time_ms=processing_time,
            cached=False,
            warnings=warnings if warnings else None,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")


async def _process_xml(
    content: bytes,
    file_hash: str,
    file_type: FileType,
    start_time: float,
    db: AsyncSession,
) -> OCRResult:
    """Process a CFDI XML file."""
    try:
        # Parse CFDI XML
        cfdi_data = cfdi_extractor.extract_from_bytes(content)

        # Validate
        validation_warnings = cfdi_extractor.validate_cfdi(cfdi_data)

        # Convert to ReceiptData format for consistency
        extracted_data = _cfdi_to_receipt_data(cfdi_data)

        # Calculate confidence (XML parsing is high confidence)
        overall_confidence = 1.0 if not validation_warnings else 0.9

        # Raw text is the XML content for reference
        raw_text = content.decode('utf-8', errors='replace')

        # Save to cache
        extracted_dict = _receipt_data_to_dict(extracted_data)
        await _save_to_cache(db, file_hash, raw_text[:10000], extracted_dict, overall_confidence)

        processing_time = int((time.time() - start_time) * 1000)

        return OCRResult(
            file_hash=file_hash,
            file_type=file_type,
            raw_text=raw_text[:5000],  # Truncate for response
            extracted_data=extracted_data,
            overall_confidence=overall_confidence,
            processing_time_ms=processing_time,
            cached=False,
            warnings=validation_warnings if validation_warnings else None,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"XML processing error: {e}")
        raise HTTPException(status_code=500, detail=f"XML processing failed: {str(e)}")


@router.post("/process-cfdi", response_model=CFDIXMLData)
async def process_cfdi(
    file: UploadFile = File(...),
) -> CFDIXMLData:
    """
    Process a CFDI XML file and return full CFDI-specific data.

    This endpoint returns the complete CFDI structure including
    conceptos, impuestos, and all SAT-specific fields.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.max_file_size_mb}MB"
        )

    # Verify it's an XML file
    ext = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
    if ext != 'xml' and file.content_type not in ['text/xml', 'application/xml']:
        raise HTTPException(status_code=400, detail="Only XML files are accepted")

    try:
        return cfdi_extractor.extract_from_bytes(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"CFDI processing error: {e}")
        raise HTTPException(status_code=500, detail=f"CFDI processing failed: {str(e)}")


@router.get("/supported-types")
async def get_supported_types() -> dict:
    """Get list of supported file types for OCR processing."""
    return {
        "images": ["image/jpeg", "image/png", "image/webp"],
        "documents": ["application/pdf"],
        "cfdi": ["text/xml", "application/xml"],
        "max_file_size_mb": settings.max_file_size_mb,
        "max_pdf_pages": 20,
    }


def _receipt_data_to_dict(data: ReceiptData) -> dict:
    """Convert ReceiptData to JSON-serializable dict for caching."""
    result = {}
    for field_name in [
        'total_amount', 'subtotal', 'iva_amount', 'currency',
        'vendor_name', 'rfc', 'receipt_number', 'date', 'address'
    ]:
        field = getattr(data, field_name)
        if field is not None:
            result[field_name] = {
                'value': str(field.value),
                'confidence': field.confidence,
                'method': field.method,
            }
    return result


def _dict_to_receipt_data(data: dict) -> ReceiptData:
    """Convert cached dict back to ReceiptData."""
    from decimal import Decimal
    from datetime import date

    result = ReceiptData()
    for field_name, field_data in data.items():
        if field_data is None:
            continue

        value = field_data.get('value')
        confidence = field_data.get('confidence', 0.0)
        method = field_data.get('method', 'cached')

        # Convert value to appropriate type
        if field_name in ['total_amount', 'subtotal', 'iva_amount']:
            try:
                value = Decimal(value)
            except Exception:
                continue
        elif field_name == 'date':
            try:
                value = date.fromisoformat(value)
            except Exception:
                continue

        setattr(result, field_name, ExtractedField(
            value=value,
            confidence=confidence,
            method=method,
        ))

    return result


def _cfdi_to_receipt_data(cfdi: CFDIXMLData) -> ReceiptData:
    """Convert CFDIXMLData to ReceiptData format."""
    return ReceiptData(
        total_amount=cfdi.total,
        subtotal=cfdi.subtotal,
        iva_amount=_extract_iva_from_cfdi(cfdi),
        currency=cfdi.moneda,
        vendor_name=cfdi.emisor_nombre,
        rfc=cfdi.emisor_rfc,
        receipt_number=_extract_folio_from_cfdi(cfdi),
        date=_extract_date_from_cfdi(cfdi),
        address=cfdi.lugar_expedicion,
    )


def _extract_iva_from_cfdi(cfdi: CFDIXMLData) -> Optional[ExtractedField]:
    """Extract IVA amount from CFDI impuestos."""
    if cfdi.impuestos_trasladados and cfdi.impuestos_trasladados.value:
        for impuesto in cfdi.impuestos_trasladados.value:
            if impuesto.get('impuesto') == '002':  # IVA code
                importe = impuesto.get('importe')
                if importe:
                    from decimal import Decimal
                    return ExtractedField(
                        value=Decimal(importe),
                        confidence=1.0,
                        method="cfdi_xml",
                    )
    return None


def _extract_folio_from_cfdi(cfdi: CFDIXMLData) -> Optional[ExtractedField]:
    """Build receipt number from serie and folio."""
    parts = []
    if cfdi.serie:
        parts.append(cfdi.serie.value)
    if cfdi.folio:
        parts.append(cfdi.folio.value)

    if parts:
        return ExtractedField(
            value="-".join(parts),
            confidence=1.0,
            method="cfdi_xml",
        )
    return None


def _extract_date_from_cfdi(cfdi: CFDIXMLData) -> Optional[ExtractedField]:
    """Extract date from CFDI fecha."""
    if cfdi.fecha and cfdi.fecha.value:
        fecha = cfdi.fecha.value
        if hasattr(fecha, 'date'):
            return ExtractedField(
                value=fecha.date(),
                confidence=1.0,
                method="cfdi_xml",
            )
    return None
