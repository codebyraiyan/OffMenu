
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  menuItems,
  restaurants,
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseRestaurantId(id: string): number | null {
  const restaurantId = Number(id);

  if (!Number.isSafeInteger(restaurantId) || restaurantId <= 0) {
    return null;
  }

  return restaurantId;
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const restaurantId = parseRestaurantId(id);

  if (restaurantId === null) {
    return NextResponse.json(
      { error: "Invalid restaurant ID." },
      { status: 400 }
    );
  }

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
      .where(eq(restaurants.id, restaurantId))
      .limit(1);

    const restaurant = restaurantRows[0];

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found." },
        { status: 404 }
      );
    }

    const menu = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.restaurantId, restaurantId));

    return NextResponse.json({ restaurant, menu });
  } catch (error) {
    console.error("Failed to fetch restaurant:", error);

    return NextResponse.json(
      { error: "Failed to fetch restaurant." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const restaurantId = parseRestaurantId(id);

  if (restaurantId === null) {
    return NextResponse.json(
      { error: "Invalid restaurant ID." },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid restaurant updates." },
      { status: 400 }
    );
  }

  const input = body as Record<string, unknown>;
  const updates: {
    isActive?: boolean;
    name?: string;
    description?: string | null;
    phone?: string;
    whatsapp?: string | null;
    address?: string | null;
    area?: string;
    imageUrl?: string | null;
  } = {};

  if ("isActive" in input) {
    if (typeof input.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean." }, { status: 400 });
    }
    updates.isActive = input.isActive;
  }

  for (const field of ["name", "phone", "area"] as const) {
    if (field in input) {
      const value = String(input[field] ?? "").trim();
      if (!value) {
        return NextResponse.json({ error: `${field} cannot be empty.` }, { status: 400 });
      }
      updates[field] = value;
    }
  }

  for (const field of ["description", "whatsapp", "address", "imageUrl"] as const) {
    if (field in input) {
      const value = String(input[field] ?? "").trim();
      updates[field] = value || null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported restaurant updates provided." }, { status: 400 });
  }

  try {
    const [existingRestaurant] = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
      })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);

    if (!existingRestaurant) {
      return NextResponse.json(
        { error: "Restaurant not found." },
        { status: 404 }
      );
    }

    const [updatedRestaurant] = await db
      .update(restaurants)
      .set({
        ...updates,
      })
      .where(eq(restaurants.id, restaurantId))
      .returning({
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
      });

    if (!updatedRestaurant) {
      return NextResponse.json(
        { error: "Failed to update restaurant status." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: updates.isActive === undefined
        ? "Restaurant details updated successfully."
        : updates.isActive
          ? "Restaurant activated successfully."
          : "Restaurant deactivated successfully.",
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error("Restaurant status update failed:", error);

    return NextResponse.json(
      { error: "Failed to update restaurant status." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Permanent restaurant deletion is disabled. Deactivate the restaurant instead to preserve its history.",
    },
    { status: 409 }
  );
}
