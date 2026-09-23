import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";

import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { createRestaurantSession } from "@/lib/auth";

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const username = String(
      body.username || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body.password || ""
    );

    if (!username || !password) {
      return NextResponse.json(
        {
          error:
            "Username and password are required."
        },
        {
          status: 400
        }
      );
    }

    const rows =
      await db
        .select()
        .from(restaurants)
        .where(
          eq(
            restaurants.username,
            username
          )
        )
        .limit(1);

    const restaurant =
      rows[0];

    if (
      !restaurant ||
      !restaurant.passwordHash
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid username or password."
        },
        {
          status: 401
        }
      );
    }

    const valid =
      await compare(
        password,
        restaurant.passwordHash
      );

    if (!valid) {
      return NextResponse.json(
        {
          error:
            "Invalid username or password."
        },
        {
          status: 401
        }
      );
    }

    await createRestaurantSession(
      restaurant.id
    );

    return NextResponse.json({
      success: true,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name
      }
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Something went wrong. Please try again."
      },
      {
        status: 500
      }
    );
  }
}