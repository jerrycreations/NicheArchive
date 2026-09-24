"use client";

import { useActionState, useEffect, useRef } from "react";
import { unlock, type UnlockState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: UnlockState = { error: null };

export function UnlockForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(unlock, initialState);
  const inputRef = useRef<HTMLInputElement>(null);

  // Each failed attempt returns a new state object, so the cursor goes back
  // into the (now cleared) field every time.
  useEffect(() => {
    if (state.error) inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" defaultValue={next} />
      <div className="flex flex-col gap-2">
        <label htmlFor="passcode" className="text-sm font-medium">
          Passcode
        </label>
        <Input
          ref={inputRef}
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "passcode-error" : undefined}
        />
        {state.error && (
          <p id="passcode-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Unlocking…" : "Unlock"}
      </Button>
    </form>
  );
}
