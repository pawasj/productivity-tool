import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { getValidGoogleToken } from "@/lib/google-token";

// POST /api/admin/export-bank-sheet — every team member's payout bank details
// as a formatted Google Sheet. Admin-only, checked server-side.

const COLUMNS = [
  "Employee ID", "Name", "Email", "Designation", "Department", "Employment Type",
  "Account Holder Name", "Bank Name", "Account Number", "IFSC Code", "Branch",
  "Account Type", "UPI ID", "Details Last Updated",
] as const;

// Long digit strings must not become numbers, or Sheets shows 1.23457E+14 and
// silently eats leading zeros. These are written as text.
const TEXT_COLUMNS = ["Account Number", "IFSC Code", "UPI ID", "Employee ID"];

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-Time", part_time: "Part-Time",
  contract: "Contract", intern: "Intern", freelancer: "Freelancer",
};

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceRoleClient();
    const { data: me } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
    if (me?.role !== "admin") {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const tokenData = await getValidGoogleToken();
    if (!tokenData) {
      return NextResponse.json(
        { error: "Google account not connected. Connect it under My Profile → Calendar, then try again." },
        { status: 401 },
      );
    }

    const [{ data: profiles }, { data: banks }] = await Promise.all([
      svc.from("profiles").select("*").order("full_name"),
      svc.from("employee_bank_details").select("*"),
    ]);

    const bankByUser = new Map((banks || []).map(b => [b.user_id, b]));

    const dataRows = (profiles || []).map(p => {
      const b = bankByUser.get(p.id) || {};
      return [
        p.employee_id || "",
        p.full_name || "",
        p.email || "",
        p.designation || "",
        p.department || "",
        EMPLOYMENT_LABELS[p.employment_type as string] || p.employment_type || "",
        b.account_holder_name || "",
        b.bank_name || "",
        b.account_number || "",
        b.ifsc_code || "",
        b.branch_name || "",
        b.account_type ? b.account_type.charAt(0).toUpperCase() + b.account_type.slice(1) : "",
        b.upi_id || "",
        b.updated_at ? new Date(b.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "",
      ];
    });

    const withDetails = dataRows.filter(r => r[8] || r[12]).length;   // account number or UPI
    const missing = dataRows.length - withDetails;
    const numCols = COLUMNS.length;
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    // ── Create the spreadsheet ────────────────────────────────────────────
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: { title: `BCC Media Network — Bank Details (${today})` },
        sheets: [{ properties: { title: "Bank Details" } }],
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return NextResponse.json({ error: `Sheets API error: ${JSON.stringify(err)}` }, { status: 500 });
    }
    const sheet = await createRes.json();
    const spreadsheetId = sheet.spreadsheetId;
    const sheetId = sheet.sheets[0].properties.sheetId;

    const titleRow = [`BCC Media Network — Team Bank Details`];
    const metaRow = [
      `Generated ${today} by ${me.full_name || "an admin"}`,
      `${dataRows.length} team members`,
      `${withDetails} with details`,
      missing > 0 ? `${missing} missing` : "",
    ];
    const confidentialRow = ["CONFIDENTIAL — payout information. Do not share outside finance."];
    const allRows = [titleRow, metaRow, confidentialRow, [], [...COLUMNS], ...dataRows];

    // RAW so Sheets never reinterprets account numbers or IFSC codes
    const valuesRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bank%20Details!A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: "Bank Details!A1", majorDimension: "ROWS", values: allRows }),
      },
    );
    if (!valuesRes.ok) {
      const err = await valuesRes.json().catch(() => ({}));
      return NextResponse.json({ error: `Values error: ${JSON.stringify(err)}` }, { status: 500 });
    }

    const headerRowIdx = 4;              // 0-indexed: title, meta, confidential, blank, header
    const firstDataRow = headerRowIdx + 1;
    const lastDataRow = firstDataRow + dataRows.length;

    const requests: Record<string, unknown>[] = [
      // Keep headers and the name column in view while scrolling
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: firstDataRow, frozenColumnCount: 2 } }, fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
      // Title
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.36, green: 0.2, blue: 0.69 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      // Meta
      { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0.25, green: 0.32, blue: 0.4 } } } }, fields: "userEnteredFormat(textFormat)" } },
      // Confidential banner
      { repeatCell: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.1, blue: 0.1 } }, backgroundColor: { red: 1, green: 0.95, blue: 0.95 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      // Column headers
      { repeatCell: { range: { sheetId, startRowIndex: headerRowIdx, endRowIndex: headerRowIdx + 1, startColumnIndex: 0, endColumnIndex: numCols }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.36, green: 0.2, blue: 0.69 }, verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(textFormat,backgroundColor,verticalAlignment)" } },
      // Banding for readability
      { addBanding: { bandedRange: { range: { sheetId, startRowIndex: firstDataRow, endRowIndex: lastDataRow, startColumnIndex: 0, endColumnIndex: numCols }, rowProperties: { firstBandColor: { red: 1, green: 1, blue: 1 }, secondBandColor: { red: 0.97, green: 0.96, blue: 1 } } } } },
      // Borders
      { updateBorders: { range: { sheetId, startRowIndex: headerRowIdx, endRowIndex: lastDataRow, startColumnIndex: 0, endColumnIndex: numCols }, innerHorizontal: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.93 } }, innerVertical: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.93 } } } },
      { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: numCols } } },
    ];

    // Force identifier columns to plain text
    for (const name of TEXT_COLUMNS) {
      const idx = COLUMNS.indexOf(name as typeof COLUMNS[number]);
      if (idx < 0) continue;
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: firstDataRow, endRowIndex: lastDataRow, startColumnIndex: idx, endColumnIndex: idx + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }

    // Flag anyone with no payout details at all
    if (dataRows.length > 0) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: firstDataRow, endRowIndex: lastDataRow, startColumnIndex: 0, endColumnIndex: numCols }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=AND($I${firstDataRow + 1}="",$M${firstDataRow + 1}="")` }] },
              format: { backgroundColor: { red: 1, green: 0.94, blue: 0.91 } },
            },
          },
          index: 0,
        },
      });
    }

    const fmtRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
    // Formatting is cosmetic — a failure here must not lose the sheet
    const formatted = fmtRes.ok;

    return NextResponse.json({
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      rows: dataRows.length,
      withDetails,
      missing,
      formatted,
    });
  } catch (err) {
    console.error("export-bank-sheet error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
