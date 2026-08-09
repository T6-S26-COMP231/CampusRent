import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import {
  guestRegistrationPromptForAction,
  type GuestRestrictedAction,
} from '../utils/guestCatalogue';

export interface GuestRegistrationPromptProps {
  action: GuestRestrictedAction;
  onDismiss?: () => void;
}

/**
 * US-01.2 — registration / sign-in prompt for restricted guest actions.
 * Reuses existing /register and /login routes. Never claims success.
 */
export default function GuestRegistrationPrompt({
  action,
  onDismiss,
}: GuestRegistrationPromptProps) {
  const prompt = guestRegistrationPromptForAction(action);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-registration-prompt-heading"
      data-testid="guest-registration-prompt"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-campus-50 text-campus-700">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="guest-registration-prompt-heading"
              className="font-display text-lg font-bold text-slate-900"
            >
              {prompt.heading}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {prompt.action_label}
            </p>
            <p
              className="mt-3 text-sm text-slate-500"
              data-testid="guest-registration-prompt-message"
            >
              {prompt.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={prompt.register_path}
            className="btn-primary"
            data-testid="guest-registration-prompt-register"
          >
            {prompt.register_label}
          </Link>
          <Link
            to={prompt.sign_in_path}
            className="btn-secondary"
            data-testid="guest-registration-prompt-sign-in"
          >
            {prompt.sign_in_label}
          </Link>
          {onDismiss && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onDismiss}
              data-testid="guest-registration-prompt-dismiss"
            >
              {prompt.dismiss_label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
