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
import { SESSION_MAX_AGE_DAYS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Sign in",
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
            {`Enter your code. This device stays signed in for ${SESSION_MAX_AGE_DAYS} days.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnlockForm next={safeNextPath(next)} />
        </CardContent>
      </Card>
    </main>
  );
}
