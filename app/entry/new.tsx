import { useRouter } from 'expo-router';

import { EntryForm } from '@/src/components/EntryForm';
import { NewLogEntry, createEntry } from '@/src/db/queries/entries';

export default function NewEntryScreen() {
  const router = useRouter();

  const handleSubmit = async (entry: NewLogEntry) => {
    await createEntry(entry);
    router.back();
  };

  return <EntryForm onSubmit={handleSubmit} submitLabel="Save entry" />;
}
