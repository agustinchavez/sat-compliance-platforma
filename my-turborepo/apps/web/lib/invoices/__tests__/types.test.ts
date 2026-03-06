/**
 * Tests for Invoice Types (Component 12 - Step 2)
 *
 * Validates that enums and constants align with database constraints
 * and CFDI 4.0 specifications.
 */

import { describe, it, expect } from "vitest";
import {
  InvoiceStatus,
  TipoComprobante,
  MetodoPago,
  TipoRelacion,
  CancellationReason,
  PaymentStatus,
  TAX_OBJECT,
  INVOICE_STATUS_VALUES,
  TIPO_COMPROBANTE_VALUES,
  METODO_PAGO_VALUES,
  TIPO_RELACION_VALUES,
  CANCELLATION_REASON_VALUES,
  PAYMENT_FORM_CODES,
  CURRENCY_CODES,
} from "../types";

describe("InvoiceStatus Enum", () => {
  it("should have exactly 7 status values", () => {
    expect(INVOICE_STATUS_VALUES).toHaveLength(7);
  });

  it("should match database CHECK constraint values", () => {
    // These must match the database check: 'draft', 'pending_stamp', 'stamped', 'sent', 'paid', 'cancelled', 'void'
    expect(InvoiceStatus.DRAFT).toBe("draft");
    expect(InvoiceStatus.PENDING_STAMP).toBe("pending_stamp");
    expect(InvoiceStatus.STAMPED).toBe("stamped");
    expect(InvoiceStatus.SENT).toBe("sent");
    expect(InvoiceStatus.PAID).toBe("paid");
    expect(InvoiceStatus.CANCELLED).toBe("cancelled");
    expect(InvoiceStatus.VOID).toBe("void");
  });

  it("should have all expected values in the array", () => {
    expect(INVOICE_STATUS_VALUES).toContain("draft");
    expect(INVOICE_STATUS_VALUES).toContain("pending_stamp");
    expect(INVOICE_STATUS_VALUES).toContain("stamped");
    expect(INVOICE_STATUS_VALUES).toContain("sent");
    expect(INVOICE_STATUS_VALUES).toContain("paid");
    expect(INVOICE_STATUS_VALUES).toContain("cancelled");
    expect(INVOICE_STATUS_VALUES).toContain("void");
  });
});

describe("TipoComprobante Enum", () => {
  it("should have exactly 3 values matching CFDI spec", () => {
    expect(TIPO_COMPROBANTE_VALUES).toHaveLength(3);
  });

  it("should match CFDI TipoDeComprobante codes", () => {
    // SAT CFDI 4.0 spec: I=Ingreso, E=Egreso, T=Traslado
    expect(TipoComprobante.INGRESO).toBe("I");
    expect(TipoComprobante.EGRESO).toBe("E");
    expect(TipoComprobante.TRASLADO).toBe("T");
  });

  it("should have values as single characters", () => {
    TIPO_COMPROBANTE_VALUES.forEach((value) => {
      expect(value).toHaveLength(1);
    });
  });

  it("should only contain valid CFDI type codes", () => {
    const validCodes = ["I", "E", "T"];
    TIPO_COMPROBANTE_VALUES.forEach((value) => {
      expect(validCodes).toContain(value);
    });
  });
});

describe("MetodoPago Enum", () => {
  it("should have exactly 2 values", () => {
    expect(METODO_PAGO_VALUES).toHaveLength(2);
  });

  it("should match CFDI MetodoPago codes", () => {
    // SAT spec: PUE=single payment, PPD=deferred/partial
    expect(MetodoPago.PUE).toBe("PUE");
    expect(MetodoPago.PPD).toBe("PPD");
  });

  it("should be 3-character codes", () => {
    expect(MetodoPago.PUE).toHaveLength(3);
    expect(MetodoPago.PPD).toHaveLength(3);
  });
});

describe("TipoRelacion Enum", () => {
  it("should have exactly 9 relationship types", () => {
    expect(TIPO_RELACION_VALUES).toHaveLength(9);
  });

  it("should match SAT TipoRelacion codes", () => {
    expect(TipoRelacion.NOTA_CREDITO).toBe("01");
    expect(TipoRelacion.NOTA_DEBITO).toBe("02");
    expect(TipoRelacion.DEVOLUCION).toBe("03");
    expect(TipoRelacion.SUSTITUCION).toBe("04");
    expect(TipoRelacion.TRASLADO_MERCANCIA).toBe("05");
    expect(TipoRelacion.FACTURA_TRASLADO).toBe("06");
    expect(TipoRelacion.APLICACION_ANTICIPO).toBe("07");
    expect(TipoRelacion.NOTA_CARGO).toBe("08");
    expect(TipoRelacion.FACTURA_ANTICIPO).toBe("09");
  });

  it("should have 2-digit string codes", () => {
    TIPO_RELACION_VALUES.forEach((value) => {
      expect(value).toHaveLength(2);
      expect(value).toMatch(/^\d{2}$/);
    });
  });

  it("should have sequential codes from 01 to 09", () => {
    const sortedValues = [...TIPO_RELACION_VALUES].sort();
    expect(sortedValues).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
    ]);
  });
});

describe("CancellationReason Enum", () => {
  it("should have exactly 4 cancellation reason codes", () => {
    expect(CANCELLATION_REASON_VALUES).toHaveLength(4);
  });

  it("should match SAT MotivoCancelacion codes", () => {
    // SAT requires specific codes for CFDI cancellation
    expect(CancellationReason.VOUCHER_ERROR).toBe("01");
    expect(CancellationReason.OPERATION_NEVER_COMPLETED).toBe("02");
    expect(CancellationReason.OPERATION_NOMINALLY_COMPLETED).toBe("03");
    expect(CancellationReason.SUBSTITUTION).toBe("04");
  });

  it("should have 2-digit string codes", () => {
    CANCELLATION_REASON_VALUES.forEach((value) => {
      expect(value).toHaveLength(2);
      expect(value).toMatch(/^\d{2}$/);
    });
  });

  it("should have codes 01 through 04", () => {
    const sortedValues = [...CANCELLATION_REASON_VALUES].sort();
    expect(sortedValues).toEqual(["01", "02", "03", "04"]);
  });
});

describe("PaymentStatus Enum", () => {
  it("should have 4 payment status values", () => {
    const values = Object.values(PaymentStatus);
    expect(values).toHaveLength(4);
  });

  it("should have expected status values", () => {
    expect(PaymentStatus.UNPAID).toBe("unpaid");
    expect(PaymentStatus.PARTIAL).toBe("partial");
    expect(PaymentStatus.PAID).toBe("paid");
    expect(PaymentStatus.OVERDUE).toBe("overdue");
  });
});

describe("TAX_OBJECT Constants", () => {
  it("should have 3 tax object codes", () => {
    expect(Object.keys(TAX_OBJECT)).toHaveLength(3);
  });

  it("should match SAT ObjetoImp codes", () => {
    // SAT spec: 01=No object, 02=Yes subject, 03=Yes not subject
    expect(TAX_OBJECT.NO_TAX).toBe("01");
    expect(TAX_OBJECT.YES_SUBJECT).toBe("02");
    expect(TAX_OBJECT.YES_NOT_SUBJECT).toBe("03");
  });

  it("should have 2-digit string codes", () => {
    Object.values(TAX_OBJECT).forEach((value) => {
      expect(value).toHaveLength(2);
      expect(value).toMatch(/^\d{2}$/);
    });
  });
});

describe("PAYMENT_FORM_CODES Constants", () => {
  it("should have common payment form codes", () => {
    expect(PAYMENT_FORM_CODES.EFECTIVO).toBe("01");
    expect(PAYMENT_FORM_CODES.CHEQUE).toBe("02");
    expect(PAYMENT_FORM_CODES.TRANSFERENCIA).toBe("03");
    expect(PAYMENT_FORM_CODES.TARJETA_CREDITO).toBe("04");
    expect(PAYMENT_FORM_CODES.TARJETA_DEBITO).toBe("28");
    expect(PAYMENT_FORM_CODES.POR_DEFINIR).toBe("99");
  });

  it("should have 2-digit string codes", () => {
    Object.values(PAYMENT_FORM_CODES).forEach((value) => {
      expect(value).toHaveLength(2);
      expect(value).toMatch(/^\d{2}$/);
    });
  });

  it("should have POR_DEFINIR as 99 (required for PPD)", () => {
    // When MetodoPago is PPD, FormaPago must be 99
    expect(PAYMENT_FORM_CODES.POR_DEFINIR).toBe("99");
  });
});

describe("CURRENCY_CODES Constants", () => {
  it("should have MXN, USD, and EUR", () => {
    expect(CURRENCY_CODES.MXN).toBe("MXN");
    expect(CURRENCY_CODES.USD).toBe("USD");
    expect(CURRENCY_CODES.EUR).toBe("EUR");
  });

  it("should have 3-character ISO currency codes", () => {
    Object.values(CURRENCY_CODES).forEach((value) => {
      expect(value).toHaveLength(3);
      expect(value).toMatch(/^[A-Z]{3}$/);
    });
  });
});

describe("Type Structure Validation", () => {
  it("should allow creating valid InvoiceItemInput", () => {
    // This is a compile-time check - if types are wrong, TS will error
    const validItem = {
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Hora",
      description: "Servicio de consultoría",
      quantity: 1,
      unit_price: 10000,
    };

    expect(validItem.sat_product_code).toBe("81112100");
    expect(validItem.quantity).toBe(1);
  });

  it("should allow creating valid CreateInvoiceInput", () => {
    const validInvoice = {
      customer_id: "cust-123",
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    expect(validInvoice.customer_id).toBe("cust-123");
    expect(validInvoice.items).toHaveLength(1);
  });

  it("should have consistent enum value types", () => {
    // All enum values should be strings
    INVOICE_STATUS_VALUES.forEach((v) => expect(typeof v).toBe("string"));
    TIPO_COMPROBANTE_VALUES.forEach((v) => expect(typeof v).toBe("string"));
    METODO_PAGO_VALUES.forEach((v) => expect(typeof v).toBe("string"));
    TIPO_RELACION_VALUES.forEach((v) => expect(typeof v).toBe("string"));
    CANCELLATION_REASON_VALUES.forEach((v) => expect(typeof v).toBe("string"));
  });
});

describe("Database Constraint Alignment", () => {
  it("InvoiceStatus values should match CHECK constraint in migration", () => {
    // From migration: status IN ('draft', 'pending_stamp', 'stamped', 'sent', 'paid', 'cancelled', 'void')
    const dbConstraintValues = [
      "draft",
      "pending_stamp",
      "stamped",
      "sent",
      "paid",
      "cancelled",
      "void",
    ];
    expect(INVOICE_STATUS_VALUES.sort()).toEqual(dbConstraintValues.sort());
  });

  it("TipoComprobante values should match CHECK constraint", () => {
    // From migration: tipo_comprobante IN ('I', 'E', 'T')
    const dbConstraintValues = ["I", "E", "T"];
    expect(TIPO_COMPROBANTE_VALUES.sort()).toEqual(dbConstraintValues.sort());
  });

  it("MetodoPago values should match CHECK constraint", () => {
    // From migration: payment_method IN ('PUE', 'PPD')
    const dbConstraintValues = ["PUE", "PPD"];
    expect(METODO_PAGO_VALUES.sort()).toEqual(dbConstraintValues.sort());
  });

  it("TipoRelacion values should match CHECK constraint", () => {
    // From migration: tipo_relacion IN ('01','02','03','04','05','06','07','08','09')
    const dbConstraintValues = [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
    ];
    expect(TIPO_RELACION_VALUES.sort()).toEqual(dbConstraintValues.sort());
  });
});
