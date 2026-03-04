/**
 * Tests for OCR client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  processReceipt,
  processCFDI,
  getSupportedTypes,
  validateFile,
  formatExtractedAmount,
  formatExtractedDate,
  getConfidenceLevel,
  hasMinimumRequiredData,
  extractDisplayFields,
  OCRServiceUnavailableError,
  OCRProcessingError,
  type OCRResult,
  type SupportedTypesResponse,
  type ReceiptData,
  type ExtractedField,
} from "../ocr-client";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
const originalEnv = process.env;

describe("OCR Client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, AI_SERVICE_URL: "http://localhost:8000" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("processReceipt", () => {
    it("should process a receipt file successfully", async () => {
      const mockResult: OCRResult = {
        file_hash: "abc123",
        file_type: "jpeg",
        raw_text: "TOTAL: $100.00",
        extracted_data: {
          total_amount: { value: "100.00", confidence: 0.9, method: "regex" },
        },
        overall_confidence: 0.9,
        processing_time_ms: 500,
        cached: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const file = new File(["test"], "receipt.jpg", { type: "image/jpeg" });
      const result = await processReceipt(file);

      expect(result.file_type).toBe("jpeg");
      expect(result.extracted_data.total_amount?.value).toBe("100.00");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw OCRServiceUnavailableError when service is down", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const file = new File(["test"], "receipt.jpg", { type: "image/jpeg" });

      await expect(processReceipt(file)).rejects.toThrow(
        OCRServiceUnavailableError
      );
    });

    it("should throw OCRProcessingError for bad requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: "Unsupported file type" }),
      });

      const file = new File(["test"], "receipt.txt", { type: "text/plain" });

      await expect(processReceipt(file)).rejects.toThrow(OCRProcessingError);
    });

    it("should throw OCRServiceUnavailableError when no URL configured", async () => {
      delete process.env.AI_SERVICE_URL;

      const file = new File(["test"], "receipt.jpg", { type: "image/jpeg" });

      await expect(processReceipt(file)).rejects.toThrow(
        OCRServiceUnavailableError
      );
    });

    it("should pass useCache option in query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            file_hash: "abc123",
            file_type: "jpeg",
            raw_text: "",
            extracted_data: {},
            overall_confidence: 0,
            processing_time_ms: 100,
            cached: false,
          }),
      });

      const file = new File(["test"], "receipt.jpg", { type: "image/jpeg" });
      await processReceipt(file, { useCache: false });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("use_cache=false"),
        expect.any(Object)
      );
    });
  });

  describe("processCFDI", () => {
    it("should process a CFDI XML file successfully", async () => {
      const mockResult = {
        uuid: { value: "12345678-1234-1234-1234-123456789012", confidence: 1.0 },
        emisor_rfc: { value: "TEST123456AB", confidence: 1.0 },
        total: { value: "1000.00", confidence: 1.0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const file = new File(["<xml>"], "cfdi.xml", { type: "text/xml" });
      const result = await processCFDI(file);

      expect(result.uuid?.value).toBe("12345678-1234-1234-1234-123456789012");
      expect(result.emisor_rfc?.value).toBe("TEST123456AB");
    });

    it("should throw OCRProcessingError for invalid XML", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: "Invalid XML syntax" }),
      });

      const file = new File(["not xml"], "cfdi.xml", { type: "text/xml" });

      await expect(processCFDI(file)).rejects.toThrow(OCRProcessingError);
    });
  });

  describe("getSupportedTypes", () => {
    it("should return supported types", async () => {
      const mockResponse: SupportedTypesResponse = {
        images: ["image/jpeg", "image/png", "image/webp"],
        documents: ["application/pdf"],
        cfdi: ["text/xml", "application/xml"],
        max_file_size_mb: 10,
        max_pdf_pages: 20,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSupportedTypes();

      expect(result.images).toContain("image/jpeg");
      expect(result.max_file_size_mb).toBe(10);
    });
  });

  describe("validateFile", () => {
    const supportedTypes: SupportedTypesResponse = {
      images: ["image/jpeg", "image/png"],
      documents: ["application/pdf"],
      cfdi: ["text/xml"],
      max_file_size_mb: 10,
      max_pdf_pages: 20,
    };

    it("should return null for valid file", () => {
      const file = new File(["test"], "receipt.jpg", { type: "image/jpeg" });
      const result = validateFile(file, supportedTypes);
      expect(result).toBeNull();
    });

    it("should return error for file too large", () => {
      // Create a "large" file mock
      const largeContent = new Array(11 * 1024 * 1024).fill("a").join("");
      const file = new File([largeContent], "large.jpg", { type: "image/jpeg" });

      const result = validateFile(file, supportedTypes);
      expect(result).toContain("too large");
    });

    it("should return error for unsupported type", () => {
      const file = new File(["test"], "notes.txt", { type: "text/plain" });
      const result = validateFile(file, supportedTypes);
      expect(result).toContain("Unsupported");
    });

    it("should allow valid extension even with unknown mime type", () => {
      const file = new File(["test"], "receipt.jpg", {
        type: "application/octet-stream",
      });
      const result = validateFile(file, supportedTypes);
      expect(result).toBeNull();
    });
  });

  describe("formatExtractedAmount", () => {
    it("should format amount with currency", () => {
      const field: ExtractedField<string> = {
        value: "1234.56",
        confidence: 0.9,
        method: "regex",
      };
      const result = formatExtractedAmount(field, "MXN");
      expect(result).toContain("1,234.56");
      expect(result).toContain("$");
    });

    it("should return null for undefined field", () => {
      const result = formatExtractedAmount(undefined);
      expect(result).toBeNull();
    });

    it("should return raw value for non-numeric", () => {
      const field: ExtractedField<string> = {
        value: "invalid",
        confidence: 0.5,
        method: "regex",
      };
      const result = formatExtractedAmount(field);
      expect(result).toBe("invalid");
    });
  });

  describe("formatExtractedDate", () => {
    it("should format valid date", () => {
      const field: ExtractedField<string> = {
        value: "2024-03-15",
        confidence: 0.9,
        method: "regex",
      };
      const result = formatExtractedDate(field);
      expect(result).toContain("2024");
    });

    it("should return null for undefined field", () => {
      const result = formatExtractedDate(undefined);
      expect(result).toBeNull();
    });
  });

  describe("getConfidenceLevel", () => {
    it("should return high for >= 0.8", () => {
      const result = getConfidenceLevel(0.9);
      expect(result.level).toBe("high");
      expect(result.label).toBe("Alta confianza");
    });

    it("should return medium for >= 0.5", () => {
      const result = getConfidenceLevel(0.6);
      expect(result.level).toBe("medium");
    });

    it("should return low for < 0.5", () => {
      const result = getConfidenceLevel(0.3);
      expect(result.level).toBe("low");
    });
  });

  describe("hasMinimumRequiredData", () => {
    it("should return true with total and RFC", () => {
      const result: OCRResult = {
        file_hash: "abc",
        file_type: "jpeg",
        raw_text: "",
        extracted_data: {
          total_amount: { value: "100.00", confidence: 0.9, method: "regex" },
          rfc: { value: "ABC123456XY9", confidence: 0.9, method: "regex" },
        },
        overall_confidence: 0.9,
        processing_time_ms: 100,
        cached: false,
      };
      expect(hasMinimumRequiredData(result)).toBe(true);
    });

    it("should return true with total and vendor", () => {
      const result: OCRResult = {
        file_hash: "abc",
        file_type: "jpeg",
        raw_text: "",
        extracted_data: {
          total_amount: { value: "100.00", confidence: 0.9, method: "regex" },
          vendor_name: { value: "OXXO", confidence: 0.9, method: "regex" },
        },
        overall_confidence: 0.9,
        processing_time_ms: 100,
        cached: false,
      };
      expect(hasMinimumRequiredData(result)).toBe(true);
    });

    it("should return false without total", () => {
      const result: OCRResult = {
        file_hash: "abc",
        file_type: "jpeg",
        raw_text: "",
        extracted_data: {
          rfc: { value: "ABC123456XY9", confidence: 0.9, method: "regex" },
        },
        overall_confidence: 0.5,
        processing_time_ms: 100,
        cached: false,
      };
      expect(hasMinimumRequiredData(result)).toBe(false);
    });

    it("should return false with only total", () => {
      const result: OCRResult = {
        file_hash: "abc",
        file_type: "jpeg",
        raw_text: "",
        extracted_data: {
          total_amount: { value: "100.00", confidence: 0.9, method: "regex" },
        },
        overall_confidence: 0.9,
        processing_time_ms: 100,
        cached: false,
      };
      expect(hasMinimumRequiredData(result)).toBe(false);
    });
  });

  describe("extractDisplayFields", () => {
    it("should extract all available fields", () => {
      const data: ReceiptData = {
        vendor_name: { value: "OXXO", confidence: 0.9, method: "regex" },
        rfc: { value: "ABC123456XY9", confidence: 0.95, method: "regex" },
        total_amount: { value: "64.38", confidence: 0.9, method: "regex" },
        date: { value: "2024-03-15", confidence: 0.8, method: "regex" },
      };

      const fields = extractDisplayFields(data);

      expect(fields.length).toBe(4);
      expect(fields.find((f) => f.label === "Proveedor")?.value).toBe("OXXO");
      expect(fields.find((f) => f.label === "RFC")?.value).toBe("ABC123456XY9");
    });

    it("should return empty array for empty data", () => {
      const fields = extractDisplayFields({});
      expect(fields).toHaveLength(0);
    });
  });
});
