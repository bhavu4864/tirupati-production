import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../../lib/auth-session";
import { getDatabase } from "../../../lib/database";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const user = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  if (params.has("date") && (!date || !validDate(date))) {
    return NextResponse.json({ error: "Select a valid production date." }, { status: 400 });
  }

  const { rows } = await getDatabase().query<{
    production_date: string;
    machine_name: string;
    part_no: string;
    morning_pcs: number | null;
    evening_pcs: number | null;
    total_pcs: number;
    operator_name: string;
    breakdown: "Yes" | "No";
    breakdown_reason: string;
  }>(
    `SELECT production_date::TEXT, machine_name, part_no, morning_pcs, evening_pcs,
            (COALESCE(morning_pcs, 0) + COALESCE(evening_pcs, 0))::INTEGER AS total_pcs,
            operator_name, breakdown, breakdown_reason
     FROM machine_daily_records
     WHERE ($1::DATE IS NULL OR production_date = $1::DATE)
     ORDER BY production_date DESC, machine_name, created_at`,
    [date],
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tirupati Brass Industries";
  const sheet = workbook.addWorksheet("Machine Production");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Machine", key: "machine", width: 20 },
    { header: "Part No.", key: "partNo", width: 20 },
    { header: "8:00 AM - 12:30 PM PCS", key: "morningPcs", width: 24 },
    { header: "1:00 PM - 7:00 PM PCS", key: "eveningPcs", width: 24 },
    { header: "Total PCS", key: "totalPcs", width: 14 },
    { header: "Operator Name", key: "operatorName", width: 22 },
    { header: "Breakdown", key: "breakdown", width: 14 },
    { header: "Breakdown Reason", key: "breakdownReason", width: 36 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `I${Math.max(1, rows.length + 1)}` };
  rows.forEach((row) => {
    sheet.addRow({
      date: row.production_date,
      machine: row.machine_name,
      partNo: row.part_no,
      morningPcs: row.morning_pcs,
      eveningPcs: row.evening_pcs,
      totalPcs: row.total_pcs,
      operatorName: row.operator_name,
      breakdown: row.breakdown,
      breakdownReason: row.breakdown_reason,
    });
  });

  const workbookBytes = await workbook.xlsx.writeBuffer();
  const filename = date ? `machine-production-${date}.xlsx` : "machine-production-all-history.xlsx";
  return new Response(new Uint8Array(workbookBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
