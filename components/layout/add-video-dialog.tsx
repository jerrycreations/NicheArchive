"use client";

import { PlusIcon } from "lucide-react";
import { createContext, use, useRef, useState } from "react";
import { AddVideoForm } from "@/components/library/add-video-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AddVideoDialogControls = {
  open: () => void;
  close: () => void;
};

const AddVideoDialogContext = createContext<AddVideoDialogControls | null>(null);

/** Opens and closes the app-wide "Add video" dialog from any page in the shell. */
export function useAddVideoDialog() {
  const controls = use(AddVideoDialogContext);
  if (!controls) {
    throw new Error("useAddVideoDialog must be used inside AddVideoDialogProvider.");
  }
  return controls;
}

export function AddVideoDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  // No DialogTrigger opens this dialog, so Radix has nothing to return focus
  // to when it closes. Remember what had focus when it opened instead.
  const openerRef = useRef<HTMLElement | null>(null);

  const controls: AddVideoDialogControls = {
    open() {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIsOpen(true);
    },
    close() {
      setIsOpen(false);
    },
  };

  return (
    <AddVideoDialogContext value={controls}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a video</DialogTitle>
            <DialogDescription>
              Paste a YouTube link to save it with its transcript.
            </DialogDescription>
          </DialogHeader>
          {/* The dialog outlives page changes, so the form closes it when it's done. */}
          <AddVideoForm onDone={() => setIsOpen(false)} />
        </DialogContent>
      </Dialog>
    </AddVideoDialogContext>
  );
}

export function AddVideoButton() {
  const { open } = useAddVideoDialog();

  return (
    <Button aria-haspopup="dialog" onClick={open}>
      <PlusIcon data-icon="inline-start" />
      Add video
    </Button>
  );
}
