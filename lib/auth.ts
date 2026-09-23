import {
  SignJWT,
  jwtVerify
} from "jose";

import { cookies } from "next/headers";

const secret = new TextEncoder().encode(
  process.env.ADMIN_SECRET ||
    "change-this-secret"
);

const ADMIN_COOKIE_NAME =
  "offmenu_admin";

const RESTAURANT_COOKIE_NAME =
  "offmenu_restaurant";

export async function createAdminSession() {
  const token =
    await new SignJWT({
      admin: true
    })
      .setProtectedHeader({
        alg: "HS256"
      })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

  const cookieStore =
    await cookies();

  cookieStore.set(
    ADMIN_COOKIE_NAME,
    token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      maxAge:
        60 * 60 * 24 * 7,
      path: "/"
    }
  );
}

export async function destroyAdminSession() {
  const cookieStore =
    await cookies();

  cookieStore.delete(
    ADMIN_COOKIE_NAME
  );
}

export async function isAdmin() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      ADMIN_COOKIE_NAME
    )?.value;

  if (!token) {
    return false;
  }

  try {
    const payload =
      await jwtVerify(
        token,
        secret
      );

    return payload.payload.admin ===
      true;
  } catch {
    return false;
  }
}

export async function createRestaurantSession(
  restaurantId: number
) {
  const token =
    await new SignJWT({
      restaurant: true,
      restaurantId
    })
      .setProtectedHeader({
        alg: "HS256"
      })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

  const cookieStore =
    await cookies();

  cookieStore.set(
    RESTAURANT_COOKIE_NAME,
    token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      maxAge:
        60 * 60 * 24 * 7,
      path: "/"
    }
  );
}

export async function destroyRestaurantSession() {
  const cookieStore =
    await cookies();

  cookieStore.delete(
    RESTAURANT_COOKIE_NAME
  );
}

export async function getRestaurantSession() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      RESTAURANT_COOKIE_NAME
    )?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } =
      await jwtVerify(
        token,
        secret
      );

    if (
      payload.restaurant !==
      true ||
      typeof payload.restaurantId !==
        "number"
    ) {
      return null;
    }

    return {
      restaurantId:
        payload.restaurantId
    };
  } catch {
    return null;
  }
}

export async function isRestaurant() {
  const session =
    await getRestaurantSession();

  return session !== null;
}