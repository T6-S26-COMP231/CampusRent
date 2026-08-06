import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { api, ConversationSummary } from '../api/client';
import {
  conversationCounterpartName,
  conversationListRoute,
  conversationListingTitle,
  conversationPreviewText,
  formatConversationTime,
} from '../utils/conversations';

/**
 * Minimal conversation shell for US-16.
 * Message input/send and history belong to US-17 / US-18 — not implemented here.
 */
export default function ConversationDetailPage() {
  const { id } = useParams();
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const conversationId = Number(id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      setError('Invalid conversation');
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .get<ConversationSummary>(`/conversations/${conversationId}`)
      .then(setConversation)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to open conversation')
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        to={conversationListRoute()}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-campus-700 hover:text-campus-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to conversations
      </Link>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {conversation && !error && (
        <section className="card">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-campus-50 text-campus-700">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Conversation
              </p>
              <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-950">
                {conversationCounterpartName(conversation)}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Listing: {conversationListingTitle(conversation)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Updated {formatConversationTime(conversation.updated_at || conversation.created_at)}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            <p className="font-semibold text-slate-800">{conversationPreviewText(conversation)}</p>
            <p className="mt-2">
              Message sending is not available yet. This conversation shell records the participants
              and listing for CampusRent messaging in a later update.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
