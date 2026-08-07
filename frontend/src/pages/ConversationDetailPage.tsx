import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { api, ConversationSummary } from '../api/client';
import MessageComposer from '../components/MessageComposer';
import { useAuth } from '../context/AuthContext';
import {
  conversationCounterpartName,
  conversationListRoute,
  conversationListingTitle,
  formatConversationTime,
} from '../utils/conversations';
import {
  EMPTY_THREAD_MESSAGE,
  appendSentMessage,
  formatMessageTime,
  isConversationParticipant,
  messageBubbleClassName,
  messageBubbleSide,
  messageRowClassName,
  sortMessagesChronologically,
  type ConversationMessage,
} from '../utils/sendMessage';

/**
 * US-16 conversation shell + US-17.2 message composer / chat display structure.
 * Message persistence and send API arrive in later US-17 tasks.
 */
export default function ConversationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
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
    setMessages([]);
    api
      .get<ConversationSummary>(`/conversations/${conversationId}`)
      .then(setConversation)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to open conversation')
      )
      .finally(() => setLoading(false));
  }, [id]);

  const orderedMessages = useMemo(
    () => sortMessagesChronologically(messages),
    [messages]
  );

  const viewerId = user?.id;
  const participantIds = conversation?.participant_ids;
  const canCompose = isConversationParticipant(viewerId, participantIds);

  const handleMessageSent = (sent: ConversationMessage) => {
    setMessages((current) => appendSentMessage(current, sent));
  };

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

          <div
            className="mt-6 flex max-h-[28rem] min-h-[14rem] flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
            aria-live="polite"
          >
            {orderedMessages.length === 0 ? (
              <div className="m-auto px-4 py-8 text-center text-sm text-slate-500">
                <p className="font-semibold text-slate-700">{EMPTY_THREAD_MESSAGE}</p>
                <p className="mt-2">
                  Messages you send will appear here in order once sending is connected.
                </p>
              </div>
            ) : (
              orderedMessages.map((message) => {
                const side = messageBubbleSide(message, viewerId);
                return (
                  <div key={message.id} className={messageRowClassName(side)}>
                    <div className={messageBubbleClassName(side)}>
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                    <p className="mt-1 px-1 text-[11px] font-medium text-slate-400">
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                );
              })
            )}
          </div>

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
