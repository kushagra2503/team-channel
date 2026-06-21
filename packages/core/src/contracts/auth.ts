export type AuthUser = {
  id: string;
  email?: string;
  displayName: string;
};

export type TeamMembership = {
  teamId: string;
  userId: string;
  role: 'admin' | 'member';
  createdAt: string;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  expiresAt: string;
};

