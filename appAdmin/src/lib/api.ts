export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export type AdminProfile = {
  id: string;
  email: string;
  name: string | null;
  adminUser: boolean;
  adminUserType: 'OWNER' | 'OPERATOR' | null;
  adminUserStatus: 'ACTIVE' | 'DISABLED';
  totpEnrolled: boolean;
  permissions: string[];
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function resolveUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null; preAuth?: string | null } = {},
): Promise<T> {
  const { token, preAuth, ...init } = options;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else if (preAuth) {
    headers.set('Authorization', `Bearer ${preAuth}`);
  }

  const res = await fetch(resolveUrl(path), { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? 'Request failed', res.status);
  }

  return data as T;
}

export function sendAdminOtp(email: string) {
  return request<{ ok: boolean }>('/admin/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function verifyAdminOtp(email: string, code: string) {
  return request<{
    preAuthToken: string;
    totpEnrolled: boolean;
    admin: AdminProfile;
  }>('/admin/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export function setupAdminTotp(preAuthToken: string) {
  return request<{ secret: string; qrDataUrl: string; manualEntryKey: string }>(
    '/admin/auth/totp/setup',
    { method: 'POST', preAuth: preAuthToken, body: '{}' },
  );
}

export function confirmAdminTotp(preAuthToken: string, secret: string, code: string) {
  return request<{ token: string; admin: AdminProfile }>('/admin/auth/totp/confirm', {
    method: 'POST',
    preAuth: preAuthToken,
    body: JSON.stringify({ secret, code }),
  });
}

export function verifyAdminTotp(preAuthToken: string, code: string) {
  return request<{ token: string; admin: AdminProfile }>('/admin/auth/totp/verify', {
    method: 'POST',
    preAuth: preAuthToken,
    body: JSON.stringify({ code }),
  });
}

export function fetchAdminMe(token: string) {
  return request<{ admin: AdminProfile }>('/admin/auth/me', { token });
}

export type PortalUser = {
  id: string;
  email: string;
  name?: string | null;
  deviceLockEnabled?: boolean;
  createdAt?: string;
};

export function fetchPortalUsers(
  token: string,
  params: { q?: string; deviceLock?: boolean; limit?: number; cursor?: string } = {},
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.deviceLock) qs.set('deviceLock', '1');
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<{ items: PortalUser[]; nextCursor: string | null; count: number }>(
    `/admin/portal/users${suffix}`,
    { token },
  );
}

export function unlockUserDevice(token: string, userId: string) {
  return request<{ ok: boolean }>(`/admin/portal/users/${userId}/device-lock`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ enabled: false }),
  });
}

export type FieldOwnerItem = {
  owner: { id: string; email: string; name: string | null; fieldCount: number };
  fields: Array<{
    id: string;
    name: string;
    city: string;
    address: string;
    status: string;
    updatedAt: string;
    thumbnail: string | null;
  }>;
};

export function fetchFieldOwners(token: string, cursor?: string) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<{ items: FieldOwnerItem[]; nextCursor: string | null }>(
    `/admin/portal/field-kyc/owners${qs}`,
    { token },
  );
}

export function fetchFieldDetail(token: string, id: string) {
  return request<any>(`/admin/portal/field-kyc/${id}`, { token });
}

export type ApprovedField = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  surfaceType?: string | null;
  size?: string | null;
  pricePerHour?: number | null;
  hasLights?: boolean;
  description?: string | null;
  status: string;
  updatedAt: string;
  thumbnail: string | null;
  images: Array<{ id: string; url: string; order: number }>;
  user?: { id: string; email: string; name: string | null };
};

export function fetchApprovedFields(
  token: string,
  params: { q?: string; limit?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<{ items: ApprovedField[] }>(`/admin/portal/fields/approved${suffix}`, { token });
}

export function updateFieldStatus(
  token: string,
  id: string,
  body: { status: string; reason?: string },
) {
  return request<{ ok: boolean }>(`/admin/portal/field-kyc/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export function fetchBookingsSummary(token: string, period: string, payment?: string) {
  const qs = new URLSearchParams({ period });
  if (payment) qs.set('payment', payment);
  return request<{ items: Array<{ fieldId: string; fieldName: string; totalEarnings: number; numBookings: number }>; total: number }>(
    `/admin/portal/bookings/summary?${qs}`,
    { token },
  );
}

export function fetchBookings(token: string, period: string, payment?: string, cursor?: string) {
  const qs = new URLSearchParams({ period });
  if (payment) qs.set('payment', payment);
  if (cursor) qs.set('cursor', cursor);
  return request<{ items: any[]; nextCursor: string | null }>(`/admin/portal/bookings?${qs}`, {
    token,
  });
}

export function fetchPendingRefunds(token: string) {
  return request<{ items: any[] }>('/admin/portal/bookings/pending-refunds', { token });
}

export function fetchPendingRefundDetail(token: string, id: string) {
  return request<{ booking: any }>(`/admin/portal/bookings/${id}`, { token });
}

export function markBookingRefunded(token: string, id: string, note?: string) {
  return request<{ ok: boolean }>(`/admin/portal/bookings/${id}/mark-refunded`, {
    method: 'POST',
    token,
    body: JSON.stringify({ note: note || '' }),
  });
}

export function fetchContractTemplate(
  token: string,
  params: { recipientName?: string; businessName?: string; platformFeePerHour?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.recipientName) qs.set('recipientName', params.recipientName);
  if (params.businessName) qs.set('businessName', params.businessName);
  if (params.platformFeePerHour != null) qs.set('platformFeePerHour', String(params.platformFeePerHour));
  return request<any>(`/admin/portal/contract-invitations/template?${qs}`, { token });
}

export function sendContractInvitation(token: string, body: Record<string, unknown>) {
  return request<{ ok: boolean }>('/admin/portal/contract-invitations', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function fetchContractInvitations(token: string, cursor?: string) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<{ items: any[]; nextCursor: string | null }>(
    `/admin/portal/contract-invitations${qs}`,
    { token },
  );
}

export type RoleSummary = {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  groupCount: number;
  permissionCount: number;
};

export type PermissionRow = {
  id: string;
  moduleKey: string;
  actionKey: string;
  name: string;
};

export function fetchRoles(token: string) {
  return request<RoleSummary[]>('/admin/roles', { token });
}

export function fetchRole(token: string, id: string) {
  return request<{
    id: string;
    name: string;
    description: string | null;
    permissionIds: string[];
    permissions: PermissionRow[];
  }>(`/admin/roles/${id}`, { token });
}

export function fetchPermissionsCatalog(token: string) {
  return request<{
    modules: string[];
    actions: string[];
    moduleActions: Record<string, string[]>;
    permissions: PermissionRow[];
  }>('/admin/roles/permissions', { token });
}

export function createRole(token: string, body: { name: string; description?: string }) {
  return request<RoleSummary>('/admin/roles', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function updateRole(
  token: string,
  id: string,
  body: { name?: string; description?: string | null },
) {
  return request<RoleSummary>(`/admin/roles/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export function setRolePermissions(token: string, id: string, permissionIds: string[]) {
  return request<{ id: string; permissionIds: string[] }>(`/admin/roles/${id}/permissions`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ permissionIds }),
  });
}

export function deleteRole(token: string, id: string) {
  return request<void>(`/admin/roles/${id}`, { method: 'DELETE', token });
}

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  roleId: string;
  role: { id: string; name: string };
  memberCount: number;
};

export function fetchGroups(token: string) {
  return request<GroupSummary[]>('/admin/groups', { token });
}

export function createGroup(
  token: string,
  body: { name: string; description?: string; roleId: string },
) {
  return request<GroupSummary>('/admin/groups', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function updateGroup(
  token: string,
  id: string,
  body: { name?: string; description?: string | null; roleId?: string },
) {
  return request<GroupSummary>(`/admin/groups/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export function deleteGroup(token: string, id: string) {
  return request<void>(`/admin/groups/${id}`, { method: 'DELETE', token });
}

export type OperatorSummary = {
  id: string;
  email: string;
  name: string | null;
  status: 'ACTIVE' | 'DISABLED';
  totpEnrolled: boolean;
  createdAt: string;
  roles: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
};

export type OperatorCandidate = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  adminUserType: string | null;
};

export function fetchOperators(token: string) {
  return request<OperatorSummary[]>('/admin/operators', { token });
}

export function searchOperatorCandidates(token: string, q: string) {
  return request<{ users: OperatorCandidate[] }>(
    `/admin/operators/candidates?q=${encodeURIComponent(q)}`,
    { token },
  );
}

export function assignOperator(
  token: string,
  body: { userId?: string; email?: string; groupIds: string[] },
) {
  return request<OperatorSummary>('/admin/operators', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function updateOperator(
  token: string,
  id: string,
  body: { groupIds?: string[]; status?: 'ACTIVE' | 'DISABLED' },
) {
  return request<OperatorSummary>(`/admin/operators/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export function disableOperator(token: string, id: string) {
  return request<OperatorSummary>(`/admin/operators/${id}/disable`, {
    method: 'POST',
    token,
    body: '{}',
  });
}

export function enableOperator(token: string, id: string) {
  return request<OperatorSummary>(`/admin/operators/${id}/enable`, {
    method: 'POST',
    token,
    body: '{}',
  });
}

export function revokeOperator(token: string, id: string) {
  return request<void>(`/admin/operators/${id}`, { method: 'DELETE', token });
}
