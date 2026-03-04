"""
OCR Service for receipt text extraction and structured parsing.
Component 10: Receipt OCR Service

Extracts text from receipt images using Tesseract OCR and parses
structured data (RFC, amounts, dates, vendor) from the raw text.
"""

import pytesseract
import re
import hashlib
import time
import logging
from PIL import Image
from typing import Optional
from datetime import datetime, date

from app.services.image_processing import ImageProcessingService
from app.models.receipt import ReceiptData, ExtractedField, OCRResult, FileType
from app.config import settings

logger = logging.getLogger(__name__)

# Configure Tesseract path
pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

# Spanish month mappings
SPANISH_MONTHS = {
    'enero': '01', 'ene': '01',
    'febrero': '02', 'feb': '02',
    'marzo': '03', 'mar': '03',
    'abril': '04', 'abr': '04',
    'mayo': '05', 'may': '05',
    'junio': '06', 'jun': '06',
    'julio': '07', 'jul': '07',
    'agosto': '08', 'ago': '08',
    'septiembre': '09', 'sep': '09', 'sept': '09',
    'octubre': '10', 'oct': '10',
    'noviembre': '11', 'nov': '11',
    'diciembre': '12', 'dic': '12',
}


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
        try:
            # Get text with confidence data
            data = pytesseract.image_to_data(
                image,
                lang=settings.ocr_language,
                config='--oem 3 --psm 6',
                output_type=pytesseract.Output.DICT
            )

            # Extract text
            raw_text = pytesseract.image_to_string(
                image,
                lang=settings.ocr_language,
                config='--oem 3 --psm 6'
            )

            # Calculate mean confidence (exclude low confidence words)
            confidences = [
                int(conf) for conf in data.get('conf', [])
                if isinstance(conf, (int, str)) and str(conf).lstrip('-').isdigit() and int(conf) >= 30
            ]

            if confidences:
                avg_confidence = sum(confidences) / len(confidences) / 100.0
            else:
                avg_confidence = 0.0

            return raw_text, min(max(avg_confidence, 0.0), 1.0)

        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return "", 0.0

    def preprocess_and_extract(self, image: Image.Image) -> tuple[str, float]:
        """
        Full pipeline: preprocess image then extract text.
        Convenience method combining image_processor and extract_text.
        """
        processed = self.image_processor.preprocess_image(image)
        return self.extract_text(processed)

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
        - 0.0 if not found
        """
        # RFC pattern
        rfc_pattern = r'[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}'

        # First, look for RFC near keyword
        lines = text.upper().split('\n')
        for line in lines:
            if any(kw in line for kw in ['RFC', 'R.F.C.', 'RFC:', 'EMISOR']):
                match = re.search(rfc_pattern, line)
                if match:
                    return ExtractedField(
                        value=match.group(),
                        confidence=1.0,
                        method="regex"
                    )

        # Fallback: find any RFC pattern
        all_matches = re.findall(rfc_pattern, text.upper())
        if all_matches:
            # Return the first one found
            return ExtractedField(
                value=all_matches[0],
                confidence=0.8,
                method="regex"
            )

        return ExtractedField(value=None, confidence=0.0, method="regex")

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
        """
        amount_pattern = r'\$?\s*([\d,]+\.?\d{0,2})'

        # Priority 1: TOTAL keywords
        priority_1_keywords = ['TOTAL A PAGAR', 'GRAN TOTAL', 'TOTAL:']
        for keyword in priority_1_keywords:
            amount = self._find_amount_near_keyword(text, keyword, amount_pattern)
            if amount:
                return ExtractedField(value=amount, confidence=0.9, method="regex")

        # Check for standalone TOTAL (not preceded by SUB)
        lines = text.upper().split('\n')
        for line in lines:
            if 'TOTAL' in line and 'SUBTOTAL' not in line and 'SUB TOTAL' not in line:
                match = re.search(amount_pattern, line)
                if match:
                    amount = self._normalize_amount(match.group(1))
                    if amount:
                        return ExtractedField(value=amount, confidence=0.9, method="regex")

        # Priority 2: Secondary keywords
        priority_2_keywords = ['IMPORTE TOTAL', 'MONTO TOTAL']
        for keyword in priority_2_keywords:
            amount = self._find_amount_near_keyword(text, keyword, amount_pattern)
            if amount:
                return ExtractedField(value=amount, confidence=0.8, method="regex")

        # Priority 3: IMPORTE
        amount = self._find_amount_near_keyword(text, 'IMPORTE', amount_pattern)
        if amount:
            return ExtractedField(value=amount, confidence=0.6, method="regex")

        # Priority 4: Largest amount on page
        all_amounts = re.findall(amount_pattern, text)
        if all_amounts:
            normalized = [self._normalize_amount(a) for a in all_amounts]
            valid_amounts = [(float(a), a) for a in normalized if a and self._is_valid_amount(a)]
            if valid_amounts:
                largest = max(valid_amounts, key=lambda x: x[0])
                return ExtractedField(value=largest[1], confidence=0.4, method="regex")

        return ExtractedField(value=None, confidence=0.0, method="regex")

    def extract_subtotal(self, text: str) -> ExtractedField:
        """
        Extract the subtotal (before tax).
        Look for lines containing: SUBTOTAL, SUB TOTAL, NETO
        """
        amount_pattern = r'\$?\s*([\d,]+\.?\d{0,2})'
        keywords = ['SUBTOTAL', 'SUB TOTAL', 'NETO']

        for keyword in keywords:
            amount = self._find_amount_near_keyword(text, keyword, amount_pattern)
            if amount:
                return ExtractedField(value=amount, confidence=0.8, method="regex")

        return ExtractedField(value=None, confidence=0.0, method="regex")

    def extract_iva(self, text: str) -> ExtractedField:
        """
        Extract IVA/tax amount.
        Look for lines containing: IVA, I.V.A., IMPUESTO, TAX
        """
        amount_pattern = r'\$?\s*([\d,]+\.?\d{0,2})'
        keywords = ['IVA', 'I.V.A.', 'IMPUESTO', 'TAX']

        for keyword in keywords:
            amount = self._find_amount_near_keyword(text, keyword, amount_pattern)
            if amount:
                return ExtractedField(value=amount, confidence=0.8, method="regex")

        return ExtractedField(value=None, confidence=0.0, method="regex")

    def extract_currency(self, text: str) -> ExtractedField:
        """
        Extract currency.
        Defaults to "MXN" with confidence 0.7 if not explicitly stated.
        Look for: MXN, USD, PESOS, DÓLARES, DOLARES.
        """
        text_upper = text.upper()

        if 'USD' in text_upper or 'DOLARES' in text_upper or 'DÓLARES' in text_upper:
            return ExtractedField(value="USD", confidence=0.9, method="regex")

        if 'MXN' in text_upper:
            return ExtractedField(value="MXN", confidence=0.9, method="regex")

        if 'PESOS' in text_upper or '$' in text:
            return ExtractedField(value="MXN", confidence=0.8, method="regex")

        # Default to MXN
        return ExtractedField(value="MXN", confidence=0.7, method="default")

    def extract_date(self, text: str) -> ExtractedField:
        """
        Extract and normalize document date.

        Supported formats:
        - DD/MM/YYYY → normalize to YYYY-MM-DD
        - YYYY-MM-DD → already normalized
        - DD-MMM-YYYY (e.g., 01-ENE-2024) → normalize to YYYY-MM-DD
        - DD de MMMM de YYYY (e.g., 01 de enero de 2024) → normalize
        """
        # Try to find date near keywords first
        date_keywords = ['FECHA', 'DATE', 'EMISION', 'F.']

        for line in text.split('\n'):
            line_upper = line.upper()
            if any(kw in line_upper for kw in date_keywords):
                date_str = self._parse_date_from_line(line)
                if date_str:
                    return ExtractedField(value=date_str, confidence=0.9, method="regex")

        # Fallback: find any date pattern
        date_str = self._parse_date_from_line(text)
        if date_str:
            return ExtractedField(value=date_str, confidence=0.7, method="regex")

        return ExtractedField(value=None, confidence=0.0, method="regex")

    def extract_vendor(self, text: str) -> ExtractedField:
        """
        Extract vendor/business name.

        Strategy:
        1. Check first 5 non-empty lines of the text
        2. Skip lines that are: pure numbers, dates, RFCs, phone numbers,
           or single words less than 3 characters.
        3. Return the best candidate with confidence 0.6.
        """
        lines = text.strip().split('\n')
        rfc_pattern = r'^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
        date_pattern = r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$'
        phone_pattern = r'^[\d\s\-\(\)]+$'

        candidates = []
        for i, line in enumerate(lines[:10]):  # Check first 10 lines
            line = line.strip()

            # Skip empty lines
            if not line:
                continue

            # Skip pure numbers
            if line.replace(' ', '').replace('.', '').replace(',', '').isdigit():
                continue

            # Skip dates
            if re.match(date_pattern, line):
                continue

            # Skip RFCs
            if re.match(rfc_pattern, line.upper()):
                continue

            # Skip phone numbers
            if re.match(phone_pattern, line) and len(line) >= 7:
                continue

            # Skip very short lines
            if len(line) < 3:
                continue

            # Skip lines that look like amounts
            if '$' in line and any(c.isdigit() for c in line):
                continue

            candidates.append((i, line))

            # Stop after finding 3 candidates
            if len(candidates) >= 3:
                break

        if candidates:
            # Prefer the first candidate (usually the business name)
            return ExtractedField(
                value=candidates[0][1],
                confidence=0.6,
                method="position"
            )

        return ExtractedField(value=None, confidence=0.0, method="position")

    def extract_receipt_number(self, text: str) -> ExtractedField:
        """
        Extract receipt/folio number.
        Look for lines containing: FOLIO, TICKET, RECIBO, FACTURA, NO., #, NUM
        """
        keywords = ['FOLIO', 'TICKET', 'RECIBO', 'FACTURA', 'NO.', '#', 'NUM', 'NUMERO']
        number_pattern = r'[A-Z0-9\-]+\d+[A-Z0-9\-]*'

        for line in text.split('\n'):
            line_upper = line.upper()
            if any(kw in line_upper for kw in keywords):
                # Extract alphanumeric value following keyword
                matches = re.findall(number_pattern, line.upper())
                if matches:
                    return ExtractedField(
                        value=matches[-1],  # Take last match (usually the number)
                        confidence=0.8,
                        method="regex"
                    )

        return ExtractedField(value=None, confidence=0.0, method="regex")

    def extract_address(self, text: str) -> ExtractedField:
        """
        Attempt to extract vendor address.
        Look for lines containing street indicators: CALLE, AV., BLVD., COL., C.P., CP
        """
        address_keywords = ['CALLE', 'AV.', 'AVENIDA', 'BLVD', 'COL.', 'COLONIA', 'C.P.', 'CP']
        address_lines = []

        for line in text.split('\n'):
            line_upper = line.upper()
            if any(kw in line_upper for kw in address_keywords):
                address_lines.append(line.strip())

        if address_lines:
            # Combine consecutive address lines
            address = ', '.join(address_lines[:3])  # Max 3 lines
            return ExtractedField(value=address, confidence=0.6, method="regex")

        return ExtractedField(value=None, confidence=0.0, method="regex")

    def _find_amount_near_keyword(
        self, text: str, keyword: str, pattern: str
    ) -> Optional[str]:
        """Find and normalize an amount near a keyword."""
        text_upper = text.upper()
        if keyword not in text_upper:
            return None

        # Find the line containing the keyword
        for line in text.split('\n'):
            if keyword in line.upper():
                match = re.search(pattern, line)
                if match:
                    return self._normalize_amount(match.group(1))
        return None

    def _normalize_amount(self, amount_str: str) -> Optional[str]:
        """
        Normalize amount string: remove commas, ensure 2 decimal places.
        Returns None if invalid.
        """
        try:
            # Remove commas and spaces
            clean = amount_str.replace(',', '').replace(' ', '')

            # Validate it's a number
            value = float(clean)

            # Format with 2 decimal places
            return f"{value:.2f}"
        except (ValueError, TypeError):
            return None

    def _is_valid_amount(self, amount_str: str) -> bool:
        """Check if amount is a valid positive number."""
        try:
            value = float(amount_str)
            return value > 0
        except (ValueError, TypeError):
            return False

    def _parse_date_from_line(self, text: str) -> Optional[str]:
        """
        Parse date from text and normalize to YYYY-MM-DD.
        Returns None if no valid date found.
        """
        # Pattern 1: DD/MM/YYYY or DD-MM-YYYY
        match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', text)
        if match:
            day, month, year = match.groups()
            year = year if len(year) == 4 else f"20{year}"
            try:
                parsed = datetime(int(year), int(month), int(day))
                if self._is_valid_date(parsed):
                    return parsed.strftime('%Y-%m-%d')
            except ValueError:
                pass

        # Pattern 2: YYYY-MM-DD (ISO format)
        match = re.search(r'(\d{4})-(\d{2})-(\d{2})', text)
        if match:
            year, month, day = match.groups()
            try:
                parsed = datetime(int(year), int(month), int(day))
                if self._is_valid_date(parsed):
                    return parsed.strftime('%Y-%m-%d')
            except ValueError:
                pass

        # Pattern 3: DD-MMM-YYYY (e.g., 01-ENE-2024)
        match = re.search(r'(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})', text)
        if match:
            day, month_name, year = match.groups()
            month_num = SPANISH_MONTHS.get(month_name.lower())
            if month_num:
                try:
                    parsed = datetime(int(year), int(month_num), int(day))
                    if self._is_valid_date(parsed):
                        return parsed.strftime('%Y-%m-%d')
                except ValueError:
                    pass

        # Pattern 4: DD de MMMM de YYYY (e.g., 01 de enero de 2024)
        match = re.search(
            r'(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})',
            text, re.IGNORECASE
        )
        if match:
            day, month_name, year = match.groups()
            month_num = SPANISH_MONTHS.get(month_name.lower())
            if month_num:
                try:
                    parsed = datetime(int(year), int(month_num), int(day))
                    if self._is_valid_date(parsed):
                        return parsed.strftime('%Y-%m-%d')
                except ValueError:
                    pass

        return None

    def _is_valid_date(self, dt: datetime) -> bool:
        """
        Validate date is reasonable (not before 1990, not in future).
        """
        min_date = datetime(1990, 1, 1)
        max_date = datetime.now()

        return min_date <= dt <= max_date
