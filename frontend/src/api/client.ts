const API_BASE = import.meta.env.VITE_API_URL || '/api';

const API_ORIGIN = API_BASE.startsWith('http')
  ? new URL(API_BASE).origin
  : '';

export function assetUrl(path: string) {
  if (!path || path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}${path}`;
}

function getToken() {
  return localStorage.getItem('campusrent_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('campusrent_token', token);
  else localStorage.removeItem('campusrent_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),
  uploadPut: <T>(path: string, formData: FormData) => request<T>(path, { method: 'PUT', body: formData }),
};

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'admin';
  verification_status: 'pending' | 'verified' | 'rejected';
  status: 'active' | 'suspended';
  phone?: string;
  created_at?: string;
}

export interface Listing {
  id: number;
  title: string;
  category: string;
  description: string;
  rental_terms: string;
  availability: 'available' | 'unavailable';
  images: { url: string }[];
  owner?: {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  } | null;
  contact_hidden?: boolean;
  created_at: string;
}

export interface RentalRequest {
  id: number;
  listing_id: number;
  renter_id: number;
  start_date: string;
  end_date: string;
  status: 'pending' | 'accepted';
  listing?: { id: number; title: string; category: string; owner_id: number };
  renter?: User;
  owner?: User;
  created_at: string;
}
