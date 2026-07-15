import { prisma } from "@/lib/db";

/**
 * Every group-scoped route must call one of these before touching data.
 * Centralizing it means we can't accidentally ship a route that forgets to
 * check membership (the classic "insecure direct object reference" bug —
 * e.g. changing /api/groups/123 to /api/groups/124 in devtools and reading
 * someone else's group).
 */

export async function getMembership(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
}

export async function requireMember(groupId: string, userId: string) {
  const membership = await getMembership(groupId, userId);
  if (!membership) {
    return { ok: false as const, status: 403, error: "You are not a member of this group" };
  }
  return { ok: true as const, membership };
}

export async function requireAdmin(groupId: string, userId: string) {
  const membership = await getMembership(groupId, userId);
  if (!membership) {
    return { ok: false as const, status: 403, error: "You are not a member of this group" };
  }
  if (membership.role !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Only a group admin can do this" };
  }
  return { ok: true as const, membership };
}
