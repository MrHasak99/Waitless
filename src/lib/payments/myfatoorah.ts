// MyFatoorah client — sandbox by default.
//
// Sandbox base URL: https://apitest.myfatoorah.com
// MyFatoorah publishes a long-lived test token at
//   https://myfatoorah.readme.io/docs/test-token
// which is the default in .env.example. Production: swap to the live token
// and `https://api.myfatoorah.com`.

const BASE_URL =
  process.env.MYFATOORAH_BASE_URL ?? "https://apitest.myfatoorah.com";

const API_KEY = process.env.MYFATOORAH_API_KEY ?? "";

export type SendPaymentInput = {
  invoiceValueKwd: number;
  customerName: string;
  customerEmail: string;
  customerMobile?: string;
  countryCode?: string;
  callbackUrl: string;
  errorUrl: string;
  customerReference?: string;
  userDefinedField?: string;
};

export type SendPaymentResult =
  | { ok: true; invoiceId: number; invoiceUrl: string }
  | { ok: false; error: string };

export async function sendPayment(
  input: SendPaymentInput,
): Promise<SendPaymentResult> {
  if (!API_KEY) {
    return { ok: false, error: "MyFatoorah API key not configured" };
  }
  try {
    const res = await fetch(`${BASE_URL}/v2/SendPayment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        // NotificationOption "LNK" means we just want a payment link back —
        // no SMS/email from MyFatoorah itself. We handle notifications.
        NotificationOption: "LNK",
        InvoiceValue: input.invoiceValueKwd,
        CustomerName: input.customerName.slice(0, 80),
        CustomerEmail: input.customerEmail,
        MobileCountryCode: input.countryCode ?? "+965",
        CustomerMobile: input.customerMobile ?? undefined,
        DisplayCurrencyIso: "KWD",
        CallBackUrl: input.callbackUrl,
        ErrorUrl: input.errorUrl,
        CustomerReference: input.customerReference,
        UserDefinedField: input.userDefinedField,
      }),
    });
    const json = (await res.json()) as {
      IsSuccess?: boolean;
      Message?: string;
      Data?: { InvoiceId: number; InvoiceURL: string };
      ValidationErrors?: { Name: string; Error: string }[];
    };
    if (!res.ok || !json.IsSuccess || !json.Data) {
      const msg =
        json.Message ??
        json.ValidationErrors?.map((v) => `${v.Name}: ${v.Error}`).join("; ") ??
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      invoiceId: json.Data.InvoiceId,
      invoiceUrl: json.Data.InvoiceURL,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type PaymentStatus = "Paid" | "Failed" | "Pending" | "Cancelled";

export type GetPaymentStatusResult =
  | {
      ok: true;
      status: PaymentStatus;
      invoiceId: number;
      invoiceValue: number;
      customerReference: string | null;
      userDefinedField: string | null;
    }
  | { ok: false; error: string };

export async function getPaymentStatus(
  paymentId: string,
): Promise<GetPaymentStatusResult> {
  if (!API_KEY) {
    return { ok: false, error: "MyFatoorah API key not configured" };
  }
  try {
    const res = await fetch(`${BASE_URL}/v2/GetPaymentStatus`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Key: paymentId, KeyType: "PaymentId" }),
    });
    const json = (await res.json()) as {
      IsSuccess?: boolean;
      Message?: string;
      Data?: {
        InvoiceStatus: string;
        InvoiceId: number;
        InvoiceValue: number;
        CustomerReference: string | null;
        UserDefinedField: string | null;
      };
    };
    if (!res.ok || !json.IsSuccess || !json.Data) {
      return { ok: false, error: json.Message ?? `HTTP ${res.status}` };
    }
    const raw = json.Data.InvoiceStatus;
    const status: PaymentStatus =
      raw === "Paid"
        ? "Paid"
        : raw === "Failed"
          ? "Failed"
          : raw === "Cancelled"
            ? "Cancelled"
            : "Pending";
    return {
      ok: true,
      status,
      invoiceId: json.Data.InvoiceId,
      invoiceValue: json.Data.InvoiceValue,
      customerReference: json.Data.CustomerReference,
      userDefinedField: json.Data.UserDefinedField,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
