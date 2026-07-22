import { JournalForm } from "@/components/journal/journal-form";
import { JournalList } from "@/components/journal/journal-list";
import { SectionHeading } from "@/components/ui";
import { getJournalEntries } from "@/lib/data";

export default async function JournalPage() {
  const entries = await getJournalEntries();

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">Journal</p>
          <h1 className="page-title">Field notes from the campaign</h1>
          <p className="page-description">A short reflection turns daily progress into a story you can revisit.</p>
        </div>
      </header>
      <div className="two-column-grid journal-page-grid">
        <JournalForm />
        <section>
          <SectionHeading title="Recent entries" description="Newest first, always yours." />
          <JournalList entries={entries} />
        </section>
      </div>
    </main>
  );
}
