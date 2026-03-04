/**
 * OCR Module - Receipt and CFDI XML processing
 *
 * This module provides client functions for the OCR microservice,
 * which extracts structured data from receipt images and CFDI XML files.
 */

export {
  // Main processing functions
  processReceipt,
  processReceiptFromBytes,
  processCFDI,
  processCFDIFromString,
  getSupportedTypes,

  // Validation and helpers
  validateFile,
  formatExtractedAmount,
  formatExtractedDate,
  getConfidenceLevel,
  hasMinimumRequiredData,
  extractDisplayFields,

  // Error classes
  OCRServiceUnavailableError,
  OCRProcessingError,

  // Types
  type ExtractedField,
  type ReceiptData,
  type OCRResult,
  type CFDIConcepto,
  type CFDIImpuesto,
  type CFDIXMLData,
  type SupportedTypesResponse,
} from "./ocr-client";
