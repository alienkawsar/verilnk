export interface OrgPublicProfile {
  id: string;
  name: string;
  website?: string;
  address?: string;
  phone?: string;
  email?: string;
  country?: { name?: string; code?: string };
  state?: { name?: string };
  category?: { name?: string };
  isVerified?: boolean;
  type?: string;
  about?: string;
  logo?: string;
  isRestricted?: boolean;
}

export const getDisplayDomain = (website?: string): string => {
  if (!website) return '—';
  try {
    return new URL(website).hostname;
  } catch {
    return website;
  }
};

export const getOrgVisibility = (type?: string): 'PUBLIC' | 'PRIVATE' => {
  return type?.toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
};

