const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const API_ORIGIN = API_BASE.startsWith('http')
  ? new URL(API_BASE).origin
  : '';

export function assetUrl(path: string) {
  if (!path || path.startsWith('http') || path.startsWith('data:')) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

function getToken() {
  return localStorage.getItem('campusrent_token');
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('campusrent_token', token);
  } else {
    localStorage.removeItem('campusrent_token');
  }
}

async function requestWithStatus<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();

  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    if (typeof data === 'object' && data !== null) {
      const errorData = data as {
        error?: string;
        message?: string;
      };

      errorMessage =
        errorData.error ||
        errorData.message ||
        errorMessage;
    } else if (typeof data === 'string' && data.trim()) {
      errorMessage = data;
    }

    throw new Error(errorMessage);
  }

  return { data: data as T, status: response.status };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await requestWithStatus<T>(path, options);
  return data;
}

export interface StartConversationBody {
  listing_id: number;
  recipient_id: number;
}

export interface StartConversationResult {
  conversation: Conversation;
  /** true when the API returned 201 Created; false for 200 existing. */
  created: boolean;
}

export const api = {
  get: <T>(path: string) =>
    request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    request<T>(path, {
      method: 'DELETE',
    }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
    }),

  uploadPut: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'PUT',
      body: formData,
    }),

  /** US-16.6 — create or return an existing conversation (201 / 200). */
  startConversation: async (body: StartConversationBody): Promise<StartConversationResult> => {
    const { data, status } = await requestWithStatus<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      conversation: data,
      created: status === 201,
    };
  },

  /**
   * US-17.6 — send a message. Never includes sender_id; server derives it from auth.
   */
  sendMessage: (conversationId: number, body: SendMessageBody): Promise<Message> =>
    request<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * US-17.6 / US-18.5 — load persisted conversation history for the open thread.
   * Same GET /api/conversations/:id/messages contract; no second history method.
   */
  getConversationMessages: (conversationId: number): Promise<Message[]> =>
    request<Message[]>(`/conversations/${conversationId}/messages`),

  /**
   * US-20.6 — submit a user or listing report.
   * Never includes reporter_id; server derives reporter from auth.
   */
  submitReport: (body: SubmitReportBody): Promise<Report> =>
    request<Report>('/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';
  listing?: {
    id: number;
    title: string;
    category: string;
    owner_id: number;
  };
  renter?: User;
  owner?: User;
  created_at: string;
}

export interface Conversation {
  id: number;
  listing_id: number;
  participant_low_id: number;
  participant_high_id: number;
  participant_ids: number[];
  created_at: string;
  updated_at: string;
}

/** Enriched conversation row from GET /api/conversations. */
export interface ConversationSummary extends Conversation {
  listing: { id: number; title: string } | null;
  counterpart: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
  latest_message_preview: string | null;
}

/** Persisted message returned by send/list message endpoints. */
export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: string;
}

/** POST /api/conversations/:id/messages — sender comes from auth only. */
export interface SendMessageBody {
  body: string;
}

/** POST /api/reports — reporter comes from auth only. */
export type ReportTargetType = 'user' | 'listing';

export interface SubmitReportBody {
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  details: string;
}

/** Persisted report returned by POST /api/reports. */
export interface Report {
  id: number;
  reporter_id: number;
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  details: string;
  created_at: string;
}