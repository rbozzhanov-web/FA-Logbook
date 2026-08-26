import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { EntryForm } from '@/src/components/EntryForm';
import { deleteEntry, getEntry, NewLogEntry, updateEntry } from '@/src/db/queries/entries';
import { entryToFormValues, EntryFormValues } from '@/src/lib/formSchema';
import { useAppTheme } from '@/src/theme';

export default function EditEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [initialValues, setInitialValues] = useState<EntryFormValues>();

  useEffect(() => {
    if (!id) return;
    getEntry(id).then((entry) => {
      if (entry) setInitialValues(entryToFormValues(entry));
    });
  }, [id]);

  if (!initialValues) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const handleSubmit = async (entry: NewLogEntry) => {
    await updateEntry(id, entry);
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(id);
          router.back();
        },
      },
    ]);
  };

  return (
    <EntryForm
      initialValues={initialValues}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
      submitLabel="Save changes"
    />
  );
}
