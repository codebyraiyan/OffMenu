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
  isAdmin
} from "@/lib/auth";
import { fromPaise, toMenuPricePaise } from "@/lib/fees";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
      itemId: string;
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
    id,
    itemId
  } = await context.params;

  const restaurantId =
    Number(id);

  const menuItemId =
    Number(itemId);

  if (
    !Number.isInteger(
      restaurantId
    ) ||
    !Number.isInteger(
      menuItemId
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid ID."
      },
      {
        status: 400
      }
    );
  }

  const body =
    await request.json();

  const updates: {
    name?: string;
    description?: string | null;
    price?: number;
    isAvailable?: boolean;
  } = {};

  if (
    body.name !== undefined
  ) {
    updates.name =
      String(body.name)
        .trim();
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
      !Number.isFinite(inputPrice)
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
    if (typeof body.isAvailable !== "boolean") {
      return NextResponse.json(
        { error: "Availability must be a boolean." },
        { status: 400 },
      );
    }
    updates.isAvailable = body.isAvailable;
  }

  const result =
    await db
      .update(menuItems)
      .set(updates)
      .where(
        and(
          eq(
            menuItems.id,
            menuItemId
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
  request: Request,
  context: {
    params: Promise<{
      id: string;
      itemId: string;
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
    id,
    itemId
  } = await context.params;

  const restaurantId =
    Number(id);

  const menuItemId =
    Number(itemId);

  if (
    !Number.isInteger(
      restaurantId
    ) ||
    !Number.isInteger(
      menuItemId
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid ID."
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
            menuItemId
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
