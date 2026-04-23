import { firestoreDb } from "../config/firestore";

export const PERMISSIONS = {
  VIEW_ORDERS: "view_orders",
  EDIT_ORDERS: "edit_orders",
  DELETE_ORDERS: "delete_orders",
  VIEW_PII: "view_pii",
  MANAGE_USERS: "manage_users",
  MANAGE_BILLING: "manage_billing",
  MANAGE_API_KEYS: "manage_api_keys",
  VIEW_ANALYTICS: "view_analytics",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Default permission sets used as fallback when no Firestore role entry exists. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: Object.values(PERMISSIONS) as Permission[],
  admin: [
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.EDIT_ORDERS,
    PERMISSIONS.DELETE_ORDERS,
    PERMISSIONS.VIEW_PII,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_ANALYTICS,
  ],
  manager: [
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.EDIT_ORDERS,
    PERMISSIONS.VIEW_PII,
    PERMISSIONS.VIEW_ANALYTICS,
  ],
  auditor: [PERMISSIONS.VIEW_ORDERS, PERMISSIONS.VIEW_ANALYTICS],
  member: [PERMISSIONS.VIEW_ORDERS],
};

/**
 * Get permissions for a user by looking up their role in Firestore.
 * Falls back to DEFAULT_ROLE_PERMISSIONS if no custom role entry exists.
 */
export async function getUserPermissions(userId: string, orgId: string): Promise<string[]> {
  const userSnap = await firestoreDb.collection("users").doc(userId).get();
  if (!userSnap.exists) return [];

  const roleName = userSnap.data()?.role ?? "member";

  // Try Firestore-backed role first (organizations/{orgId}/roles/{roleName})
  const roleSnap = await firestoreDb
    .collection("organizations").doc(orgId)
    .collection("roles").doc(roleName)
    .get();

  if (roleSnap.exists && roleSnap.data()?.permissions) {
    return roleSnap.data()!.permissions as string[];
  }

  // Fallback to defaults
  return DEFAULT_ROLE_PERMISSIONS[roleName] ?? [];
}

/**
 * Check if a user has a specific permission.
 */
export async function hasPermission(
  userId: string,
  orgId: string,
  permission: Permission,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, orgId);
  return permissions.includes(permission);
}
