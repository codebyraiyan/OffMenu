import { NextResponse } from "next/server";
import { destroyAdminSession } from "@/lib/auth";

export async function POST() {
  await destroyAdminSession();

  return NextResponse.json({
    success: true,
  });
}