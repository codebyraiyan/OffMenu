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
import { fromPaise, toMenuPricePaise } from "@/lib/fees";

export async function POST(
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

  if (!restaurantRows[0]) {
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

  const body =
    await request.json();

  const name =
    String(body.name || "")
      .trim();

  const description =
    String(
      body.description || ""
    ).trim();

  const inputPrice =
    Number(body.price);
  let price: number;
  try {
    price = fromPaise(toMenuPricePaise(inputPrice));
  } catch {
    return NextResponse.json(
      { error: "Enter a positive price with at most two decimal places." },
      { status: 400 },
    );
  }

  if (
    !name ||
    !Number.isFinite(inputPrice)
  ) {
    return NextResponse.json(
      {
        error:
          "Item name and a valid price are required."
      },
      {
        status: 400
      }
    );
  }

  const result =
    await db
      .insert(menuItems)
      .values({
        restaurantId,
        name,
        description:
          description ||
          null,
        price,
        isAvailable:
          true
      })
      .returning();

  return NextResponse.json(
    result[0]
  );
}
