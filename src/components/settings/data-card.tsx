import Link from "next/link";
import { Card } from "@/components/ui";

/** Plain statement of what is and isn't available yet. No pretend buttons. */
export function DataCard() {
  return (
    <Card as="section" aria-labelledby="settings-data-heading" className="fade-up mt-4">
      <h2 id="settings-data-heading" className="text-xl font-bold text-ink">
        Your data
      </h2>
      <p className="mt-2 text-ink">
        Downloading a copy of your data and permanently deleting it are planned for a later release. They aren&apos;t available in this preview yet.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5">
        <li>
          <Link href="/privacy/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline">
            What&apos;s private
          </Link>
        </li>
        <li>
          <Link href="/support/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline">
            Support
          </Link>
        </li>
      </ul>
    </Card>
  );
}
