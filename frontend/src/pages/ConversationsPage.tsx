import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { api, ConversationSummary } from '../api/client';
import {
  conversationDetailRoute,
  conversationListItemClassName,
  conversationListPreview,
  conversationsEmptyMessage,
  formatConversationTime,
  isActiveConversation,
  toActiveConversationIdentity,
} from '../utils/conversationHistory';

interface ConversationsLocationState {
  activeConversationId?: number;
}

export default function ConversationsPage() {
  const location = useLocation();
  const activeConversationId = (location.state as ConversationsLocationState | null)
    ?.activeConversationId;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get<ConversationSummary[]>('/conversations')
      .then(setConversations)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to load conversations')
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">
          Messaging
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">
          Conversations
        </h1>
        <p className="mt-2 text-slate-500">
          Open a conversation to view history and continue messaging with listing owners and renters.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="card mt-8 py-14 text-center">
          <MessageCircle className="mx-auto h-12 w-12 text-campus-300" />
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">
            No conversations yet
          </h2>
          <p className="mt-2 text-sm text-slate-500">{conversationsEmptyMessage()}</p>
          <Link to="/browse" className="btn-primary mt-6 inline-flex">
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {conversations.map((conversation) => {
            const identity = toActiveConversationIdentity(conversation);
            const active = isActiveConversation(conversation.id, activeConversationId);
            return (
              <Link
                key={conversation.id}
                to={conversationDetailRoute(conversation.id)}
                className={conversationListItemClassName(active)}
                aria-current={active ? 'page' : undefined}
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      {identity.counterpartName}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {identity.listingTitle}
                    </p>
                    <p className="mt-3 text-sm text-slate-500">
                      {conversationListPreview(conversation)}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {formatConversationTime(conversation.updated_at || conversation.created_at)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
