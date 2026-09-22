import { redirect } from "next/navigation";

import { isAdmin } from "@/lib/auth";

import AdminShell from "@/components/AdminShell";

export default async function AdminDashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const authenticated =
    await isAdmin();

  if (!authenticated) {
    redirect("/admin/login");
  }

  return (
    <AdminShell>
      {children}
    </AdminShell>
  );
}