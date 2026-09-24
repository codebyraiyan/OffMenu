import {
  NextResponse
} from "next/server";

import {
  and,
  eq
} from "drizzle-orm";

import { db } from "@/db";

import {
  menuItems
} from "@/db/schema";

import {
  getRestaurantSession
} from "@/lib/auth";

export async function POST(
  request: Request
) {
  const session =
    await getRestaurantSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const restaurantId =
    session.restaurantId;

  const body =
    await request.json();

  const name =
    String(
      body.name || ""
    ).trim();

  const description =
    String(
      body.description || ""
    ).trim();

  const price =
    Number(body.price);

  if (
    !name ||
    !Number.isFinite(price) ||
    price <= 0
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
          description || null,
        price,
        isAvailable: true
      })
      .returning();

  return NextResponse.json(
    result[0],
    {
      status: 201
    }
  );
}

export async function PATCH(
  request: Request
) {
  const session =
    await getRestaurantSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const restaurantId =
    session.restaurantId;

  const body =
    await request.json();

  const itemId =
    Number(body.id);

  if (
    !Number.isInteger(itemId)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid menu item ID."
      },
      {
        status: 400
      }
    );
  }

  const updates: {
    name?: string;
    description?: string | null;
    price?: number;
    isAvailable?: boolean;
  } = {};

  if (
    body.name !== undefined
  ) {
    const name =
      String(body.name)
        .trim();

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Item name cannot be empty."
        },
        {
          status: 400
        }
      );
    }

    updates.name = name;
  }

  if (
    body.description !==
    undefined
  ) {
    updates.description =
      body.description
        ? String(
            body.description
          ).trim()
        : null;
  }

  if (
    body.price !== undefined
  ) {
    const price =
      Number(body.price);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid price."
        },
        {
          status: 400
        }
      );
    }

    updates.price = price;
  }

  if (
    body.isAvailable !==
    undefined
  ) {
    updates.isAvailable =
      Boolean(
        body.isAvailable
      );
  }

  if (
    Object.keys(updates)
      .length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "No changes provided."
      },
      {
        status: 400
      }
    );
  }

  const result =
    await db
      .update(menuItems)
      .set(updates)
      .where(
        and(
          eq(
            menuItems.id,
            itemId
          ),
          eq(
            menuItems.restaurantId,
            restaurantId
          )
        )
      )
      .returning();

  if (
    result.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Menu item not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json(
    result[0]
  );
}

export async function DELETE(
  request: Request
) {
  const session =
    await getRestaurantSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const restaurantId =
    session.restaurantId;

  const url =
    new URL(request.url);

  const itemId =
    Number(
      url.searchParams.get(
        "id"
      )
    );

  if (
    !Number.isInteger(itemId)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid menu item ID."
      },
      {
        status: 400
      }
    );
  }

  const result =
    await db
      .delete(menuItems)
      .where(
        and(
          eq(
            menuItems.id,
            itemId
          ),
          eq(
            menuItems.restaurantId,
            restaurantId
          )
        )
      )
      .returning();

  if (
    result.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Menu item not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json({
    success: true
  });
}