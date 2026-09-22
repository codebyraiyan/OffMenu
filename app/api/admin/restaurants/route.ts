import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  restaurants,
  menuItems
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rows = await db
    .select()
    .from(restaurants);

  const result = await Promise.all(
    rows.map(async (restaurant) => {
      const menu = await db
        .select()
        .from(menuItems)
        .where(
          eq(
            menuItems.restaurantId,
            restaurant.id
          )
        );

      return {
        ...restaurant,
        menu
      };
    })
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();

  if (
    !body.name ||
    !body.phone ||
    !body.area
  ) {
    return NextResponse.json(
      {
        error:
          "Name, phone and area are required."
      },
      {
        status: 400
      }
    );
  }

  const result = await db
    .insert(restaurants)
    .values({
      name: body.name,
      description: body.description || null,
      phone: body.phone,
      whatsapp: body.whatsapp || null,
      address: body.address || null,
      area: body.area,
      imageUrl: body.imageUrl || null
    })
    .returning();

  return NextResponse.json(result[0]);
}