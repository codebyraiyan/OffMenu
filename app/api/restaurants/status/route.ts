import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { getRestaurantSession } from "@/lib/auth";

export async function PATCH(request: Request) {
  const session = await getRestaurantSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("isOpen" in body) ||
    typeof body.isOpen !== "boolean"
  ) {
    return NextResponse.json({ error: "isOpen must be a boolean." }, { status: 400 });
  }

  const [restaurant] = await db
    .update(restaurants)
    .set({ isOpen: body.isOpen })
    .where(eq(restaurants.id, session.restaurantId))
    .returning({ id: restaurants.id, name: restaurants.name, isOpen: restaurants.isOpen });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  return NextResponse.json({ restaurant });
}
