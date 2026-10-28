
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { restaurants, menuItems } from "@/db/schema";

export async function GET() {
  try {
    const restaurantRows = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        description: restaurants.description,
        phone: restaurants.phone,
        whatsapp: restaurants.whatsapp,
        address: restaurants.address,
        area: restaurants.area,
        imageUrl: restaurants.imageUrl,
        isOpen: restaurants.isOpen,
        isActive: restaurants.isActive,
        createdAt: restaurants.createdAt,
      })
      .from(restaurants)
      .where(
        and(
          eq(restaurants.isActive, true),
          eq(restaurants.isOpen, true)
        )
      );

    const result = await Promise.all(
      restaurantRows.map(async (restaurant) => {
        const items = await db
          .select()
          .from(menuItems)
          .where(eq(menuItems.restaurantId, restaurant.id));

        return {
          ...restaurant,
          menu: items,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch customer restaurants:", error);

    return NextResponse.json(
      { error: "Failed to load restaurants." },
      { status: 500 }
    );
  }
}
