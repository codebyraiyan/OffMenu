import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";

import { db } from "@/db";
import { restaurants, menuItems } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.select().from(restaurants);

  const result = await Promise.all(
    rows.map(async (restaurant) => {
      const menu = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.restaurantId, restaurant.id));

      return {
        ...restaurant,
        passwordHash: undefined,
        menu,
      };
    })
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const area = String(body.area || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!name || !phone || !area || !username || !password) {
    return NextResponse.json(
      { error: "Name, phone, area, username and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    return NextResponse.json(
      {
        error:
          "Username can only contain lowercase letters, numbers, dots, underscores and hyphens.",
      },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.username, username))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "That username is already in use." },
      { status: 409 }
    );
  }

  const passwordHash = await hash(password, 12);

  const result = await db
    .insert(restaurants)
    .values({
      name,
      description: body.description ? String(body.description).trim() : null,
      phone,
      whatsapp: body.whatsapp ? String(body.whatsapp).trim() : phone,
      address: body.address ? String(body.address).trim() : null,
      area,
      imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
      username,
      passwordHash,
    })
    .returning({
      id: restaurants.id,
      name: restaurants.name,
      username: restaurants.username,
    });

  const restaurant = result[0];

  if (!restaurant) {
    return NextResponse.json(
      { error: "Failed to create restaurant." },
      { status: 500 }
    );
  }

  return NextResponse.json(restaurant);
}