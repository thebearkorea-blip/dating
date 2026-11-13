// /admin 접근 판정. 운영자(users.is_admin)만 통과, 그 밖에는 404.
export function isAdminUser(user: { isAdmin: boolean } | null | undefined): boolean {
  return !!user?.isAdmin;
}
