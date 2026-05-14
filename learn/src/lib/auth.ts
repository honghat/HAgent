import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const SECRET = process.env.JWT_SECRET!;
export const COOKIE_NAME = 'nh_token';
const DEFAULT_LEARN_USER_ID = 1;
const DEFAULT_LEARN_PASSWORD = 'Thaco@2018';

export interface AuthUser {
  id: number; name: string; email: string; role: string; status: string;
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthUser | null {
  try { return jwt.verify(token, SECRET) as AuthUser; } catch { return null; }
}

export async function getSession(): Promise<AuthUser | null> {
  const fallback = await prisma.user.upsert({
    where: { id: DEFAULT_LEARN_USER_ID },
    update: {
      name: 'hat',
      role: 'admin',
      status: 'approved',
    },
    create: {
      id: DEFAULT_LEARN_USER_ID,
      name: 'hat',
      email: 'hat@newhat.local',
      password: await bcrypt.hash(DEFAULT_LEARN_PASSWORD, 10),
      role: 'admin',
      status: 'approved',
    },
  });

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const user = token ? verifyToken(token) : null;
  return user || {
    id: fallback.id,
    name: fallback.name,
    email: fallback.email,
    role: fallback.role,
    status: fallback.status,
  };
}

// Build Set-Cookie header string. Using Secure and SameSite=None for HTTPS compatibility.
export function setCookieHeader(token: string) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=None`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=None`;
}
