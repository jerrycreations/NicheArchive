import type { Metadata } from "next";
import { UnlockForm } from "@/components/auth/unlock-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = {
  title: "Unlock",
};

export default async function UnlockPage({
  searchParams,
}: PageProps<"/unlock">) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg">NicheArchive</h1>
          </CardTitle>
          <CardDescription>
            Enter the shared passcode. This device stays unlocked for 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnlockForm next={safeNextPath(next)} />
        </CardContent>
      </Card>
    </main>
  );
}
