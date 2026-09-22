import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, menuItems } from "@/db/schema";

export async function GET() {
  const restaurantRows = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.isOpen, true));

  const result = await Promise.all(
    restaurantRows.map(async (restaurant) => {
      const items = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.restaurantId, restaurant.id));

      return {
        ...restaurant,
        menu: items
      };
    })
  );

  return NextResponse.json(result);
}