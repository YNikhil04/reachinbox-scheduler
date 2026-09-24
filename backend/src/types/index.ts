export interface AuthenticatedUser {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}
