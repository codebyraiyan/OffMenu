import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(
  process.env.ADMIN_SECRET || "change-this-secret"
);

const COOKIE_NAME = "offmenu_admin";

export async function createAdminSession() {
  const token = await new SignJWT({
    admin: true
  })
    .setProtectedHeader({
      alg: "HS256"
    })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/"
  });
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();

  cookieStore.delete(COOKIE_NAME);
}

export async function isAdmin() {
  const cookieStore = await cookies();

  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  try {
    await jwtVerify(token, secret);

    return true;
  } catch {
    return false;
  }
}