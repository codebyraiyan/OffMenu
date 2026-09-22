import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();

  const email = String(body.email || "");
  const password = String(body.password || "");

  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return NextResponse.json(
      {
        error: "Invalid credentials"
      },
      {
        status: 401
      }
    );
  }

  await createAdminSession();

  return NextResponse.json({
    success: true
  });
}