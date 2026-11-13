import { notFound } from "next/navigation";
import { isAdminUser } from "@/admin/guard";
import { getCurrentUser } from "@/auth/index";

/** 운영자가 아니면 404(존재 자체를 드러내지 않는다). */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) notFound();
  return user;
}
