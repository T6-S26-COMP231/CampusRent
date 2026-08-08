import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { api, ConversationSummary } from '../api/client';
import ConversationHistoryThread from '../components/ConversationHistoryThread';
import MessageComposer from '../components/MessageComposer';
import ReportContentForm from '../components/ReportContentForm';
import { useAuth } from '../context/AuthContext';
import {
  appendHistoryAfterSend,
  applyHistoryLoadFailure,
  applyLoadedHistory,
  conversationListRoute,
  formatConversationTime,
  historyHeaderEyebrow,
  historyHeaderSubtitle,
  historyHeaderTitle,
  prepareHistoryMessages,
  toActiveConversationIdentity,
  type ConversationMessage,
} from '../utils/conversationHistory';
import {
  REPORT_NOT_CONNECTED_MESSAGE,
  REPORT_USER_ENTRY_LABEL,
  canReportTarget,
  toReportUserTarget,
} from '../utils/reportContent';
import { isConversationParticipant } from '../utils/sendMessage';

/**
 * US-17 send workflow + US-18.5 history integration.
 * Loads persisted history via existing api.getConversationMessages
 * (GET /api/conversations/:id/messages). No second history endpoint.
 */
export default function ConversationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReportUser, setShowReportUser] = useState(false);

  useEffect(() => {
    const conversationId = Number(id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      setConversation(null);
      setMessages([]);
      setError('Invalid conversation');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setConversation(null);
    setMessages([]);
    setShowReportUser(false);

    Promise.all([
      api.get<ConversationSummary>(`/conversations/${conversationId}`),
      api.getConversationMessages(conversationId),
    ])
      .then(([detail, thread]) => {
        if (cancelled) return;
        const loaded = applyLoadedHistory(thread);
        setConversation(detail);
        setMessages(loaded.messages);
        setError(loaded.error);
      })
      .catch((err) => {
        if (cancelled) return;
        const failed = applyHistoryLoadFailure(err);
        setConversation(null);
        setMessages(failed.messages);
        setError(failed.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const orderedMessages = useMemo(
    () => prepareHistoryMessages(messages),
    [messages]
  );

  const viewerId = user?.id;
  const participantIds = conversation?.participant_ids;
  const canCompose = isConversationParticipant(viewerId, participantIds);
  const identity = conversation ? toActiveConversationIdentity(conversation) : null;

  const counterpartReportTarget =
    conversation?.counterpart != null
      ? toReportUserTarget(conversation.counterpart, {
          listingId: conversation.listing_id,
          listingTitle: conversation.listing?.title,
        })
      : null;
  const canReportCounterpart =
    Boolean(counterpartReportTarget) &&
    canReportTarget(viewerId, counterpartReportTarget);

  const handleMessageSent = (sent: ConversationMessage) => {
    setMessages((current) => appendHistoryAfterSend(current, sent));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-6 h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        to={conversationListRoute()}
        state={conversation ? { activeConversationId: conversation.id } : undefined}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-campus-700 hover:text-campus-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to conversations
      </Link>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {conversation && identity && !error && (
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-campus-50 text-campus-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {historyHeaderEyebrow()}
                </p>
                <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-950">
                  {historyHeaderTitle(identity)}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {historyHeaderSubtitle(identity)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Updated {formatConversationTime(conversation.updated_at || conversation.created_at)}
                </p>
              </div>
            </div>
            {canReportCounterpart && (
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => setShowReportUser((open) => !open)}
              >
                {REPORT_USER_ENTRY_LABEL}
              </button>
            )}
          </div>

          {showReportUser && counterpartReportTarget && (
            <ReportContentForm
              target={counterpartReportTarget}
              viewerId={viewerId}
              onCancel={() => setShowReportUser(false)}
              onSubmit={async () => {
                // US-20.6 wires POST here — do not fabricate a saved report.
                throw new Error(REPORT_NOT_CONNECTED_MESSAGE);
              }}
            />
          )}

          <ConversationHistoryThread
            messages={orderedMessages}
            viewerId={viewerId}
            counterpartName={identity.counterpartName}
          />

          {canCompose ? (
            <MessageComposer
              conversationId={conversation.id}
              viewerId={viewerId}
              participantIds={participantIds}
              onSent={handleMessageSent}
            />
          ) : (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Only conversation participants may send messages.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
