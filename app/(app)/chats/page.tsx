import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chats",
};

// Placeholder until Step 33 builds the chat list.
export default function ChatsPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
      <p className="text-muted-foreground">Your chats will appear here.</p>
    </div>
  );
}
