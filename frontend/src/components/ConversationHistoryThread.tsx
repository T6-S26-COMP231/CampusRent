import {
  historyEmptyStateBody,
  historyEmptyStateTitle,
  historyMessageSenderName,
  historyScrollRegionClassName,
  historySenderLabelClassName,
  historyTimestampClassName,
  formatMessageTime,
  messageBubbleClassName,
  messageBubbleSide,
  messageRowClassName,
  prepareHistoryMessages,
  type ConversationMessage,
} from '../utils/conversationHistory';

interface Props {
  messages: ConversationMessage[];
  viewerId: number | undefined;
  counterpartName: string;
}

/**
 * US-18.2 — scrollable chronological history for the open conversation.
 * Presentational only; data loading stays on ConversationDetailPage (US-17 GET).
 */
export default function ConversationHistoryThread({
  messages,
  viewerId,
  counterpartName,
}: Props) {
  const ordered = prepareHistoryMessages(messages);

  return (
    <div className={historyScrollRegionClassName()} aria-live="polite" aria-label="Conversation history">
      {ordered.length === 0 ? (
        <div className="m-auto px-4 py-8 text-center text-sm text-slate-500">
          <p className="font-semibold text-slate-700">{historyEmptyStateTitle()}</p>
          <p className="mt-2">{historyEmptyStateBody()}</p>
        </div>
      ) : (
        ordered.map((message) => {
          const side = messageBubbleSide(message, viewerId);
          const senderLabel = historyMessageSenderName(message, viewerId, counterpartName);
          return (
            <div key={message.id} className={messageRowClassName(side)}>
              <p className={historySenderLabelClassName(side)}>{senderLabel}</p>
              <div className={messageBubbleClassName(side)}>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
              </div>
              <p className={historyTimestampClassName()}>
                {formatMessageTime(message.created_at)}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
