import {
  NextResponse
} from "next/server";

import {
  eq
} from "drizzle-orm";

import { db } from "@/db";

import {
  restaurants,
  menuItems
} from "@/db/schema";

import {
  isAdmin
} from "@/lib/auth";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const {
    id
  } = await context.params;

  const restaurantId =
    Number(id);

  if (
    !Number.isInteger(
      restaurantId
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid restaurant ID."
      },
      {
        status: 400
      }
    );
  }

  const restaurantRows =
    await db
      .select()
      .from(restaurants)
      .where(
        eq(
          restaurants.id,
          restaurantId
        )
      )
      .limit(1);

  const restaurant =
    restaurantRows[0];

  if (!restaurant) {
    return NextResponse.json(
      {
        error:
          "Restaurant not found."
      },
      {
        status: 404
      }
    );
  }

  const menu =
    await db
      .select()
      .from(menuItems)
      .where(
        eq(
          menuItems.restaurantId,
          restaurantId
        )
      );

  return NextResponse.json({
    restaurant,
    menu
  });
}