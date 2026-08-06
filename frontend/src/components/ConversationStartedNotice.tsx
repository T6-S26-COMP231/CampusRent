import { Link } from 'react-router-dom';
import {
  conversationDetailRoute,
  conversationListRoute,
} from '../utils/conversations';

interface Props {
  message: string;
  conversationId: number | null;
}

/** Success banner after starting a conversation — links to the dashboard/shell. */
export default function ConversationStartedNotice({ message, conversationId }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <p className="font-semibold text-emerald-900">{message}</p>
      <p className="mt-1 text-emerald-800">
        It now appears in your Conversations list. Message sending is not available yet.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          to={conversationListRoute()}
          className="font-semibold text-campus-700 underline-offset-2 hover:underline"
        >
          Open Conversations
        </Link>
        {conversationId != null && (
          <Link
            to={conversationDetailRoute(conversationId)}
            className="font-semibold text-campus-700 underline-offset-2 hover:underline"
          >
            View this conversation
          </Link>
        )}
      </div>
    </div>
  );
}
