'use client';

import { useState } from 'react';
import { SignInButton } from '@clerk/nextjs';

/**
 * The first-run call to action.
 *
 * A client component purely so the button can show a pending state: the click
 * starts an OAuth redirect, and without feedback the page looks inert for as
 * long as that round trip takes, which invites a second click.
 */
export default function SignInCta({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <SignInButton forceRedirectUrl="/calendar" fallbackRedirectUrl="/calendar">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => setPending(true)}
      >
        {pending ? 'Taking you to Google…' : 'Continue with Google'}
      </button>
    </SignInButton>
  );
}
