/**
 * API helpers for Playwright E2E tests.
 * Creates / deletes test users via HTTP API to ensure test isolation.
 */

const API_BASE = process.env.API_URL ?? "http://localhost:3001";

function timestamp() {
  return Date.now();
}

export interface TestCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function createTestPro(): Promise<TestCredentials> {
  const ts = timestamp();
  const creds: TestCredentials = {
    email: `test-pro-${ts}@blyss-e2e.test`,
    password: "TestPro1234!",
    firstName: "TestPro",
    lastName: `${ts}`,
  };

  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      first_name: creds.firstName,
      last_name: creds.lastName,
      phone_number: "0612345678",
      role: "pro",
      activity_name: "Test Activity",
      city: "Paris",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`createTestPro failed: ${res.status} ${body}`);
  }

  return creds;
}

export async function createTestClient(): Promise<TestCredentials> {
  const ts = timestamp();
  const creds: TestCredentials = {
    email: `test-client-${ts}@blyss-e2e.test`,
    password: "TestClient1234!",
    firstName: "TestClient",
    lastName: `${ts}`,
  };

  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      first_name: creds.firstName,
      last_name: creds.lastName,
      phone_number: "0687654321",
      role: "client",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`createTestClient failed: ${res.status} ${body}`);
  }

  return creds;
}

export async function createTestAdmin(): Promise<TestCredentials> {
  return {
    email: process.env.TEST_ADMIN_EMAIL ?? "admin@blyss.test",
    password: process.env.TEST_ADMIN_PASSWORD ?? "",
    firstName: "Admin",
    lastName: "Test",
  };
}

/**
 * Login via API and return cookies as string (for subsequent requests).
 */
export async function loginViaApi(
  email: string,
  password: string
): Promise<{ cookies: string; ok: boolean; status: number }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const setCookie = res.headers.get("set-cookie") ?? "";
  return { cookies: setCookie, ok: res.ok, status: res.status };
}

/**
 * Delete a test account via the RGPD delete-account endpoint.
 * Requires a valid session cookie.
 */
export async function deleteTestUser(cookies: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/delete-account`, {
    method: "DELETE",
    headers: { Cookie: cookies },
  });
}

/**
 * Deactivate then delete a user as admin.
 * adminCookies: cookies from an authenticated admin session.
 */
export async function adminDeleteUser(
  userId: number,
  adminCookies: string
): Promise<void> {
  await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: { Cookie: adminCookies },
  });
}
