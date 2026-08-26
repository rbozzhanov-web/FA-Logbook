import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { listEntries } from '@/src/db/queries/entries';
import { annotateDuplicates } from '@/src/lib/pdfImport/dedupe';
import { usePdfTextExtractor } from '@/src/lib/pdfImport/extractText';
import { parseRoster } from '@/src/lib/pdfImport/parseRoster';
import { useImportDraftStore } from '@/src/store/importDraft';
import { AppColors, useAppTheme } from '@/src/theme';

type Status = 'idle' | 'picking' | 'extracting' | 'parsing' | 'error';

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Choose roster PDF',
  error: 'Choose roster PDF',
  picking: 'Opening picker…',
  extracting: 'Reading PDF…',
  parsing: 'Reading the roster…',
};

export default function ImportPickScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { extractText, webViewElement } = usePdfTextExtractor();
  const setDraft = useImportDraftStore((state) => state.setDraft);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();

  const pickAndImport = async () => {
    setErrorMessage(undefined);
    setStatus('picking');

    const result = await getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) {
      setStatus('idle');
      return;
    }

    try {
      setStatus('extracting');
      const base64 = await new File(result.assets[0].uri).base64();
      const pages = await extractText(base64);

      setStatus('parsing');
      const { candidates, crossChecks, ruleId, subject } = parseRoster(pages);
      const existingEntries = await listEntries();
      const annotated = annotateDuplicates(candidates, existingEntries);

      setDraft({ candidates: annotated, crossChecks, ruleId, subject });
      setStatus('idle');
      router.push('/import/review');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  };

  const busy = status === 'picking' || status === 'extracting' || status === 'parsing';

  return (
    <View style={styles.container}>
      {webViewElement}
      <Text style={styles.description}>
        Choose your Personal Crew Schedule Report. Every sector is read from the roster grid, its
        block time worked out across the two stations' timezones, and its night hours computed from
        the real position of the sun — then checked against the report's own Block Hours total. You
        review everything before a single entry is saved.
      </Text>

      <Pressable style={styles.button} onPress={pickAndImport} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{STATUS_LABEL[status]}</Text>}
      </Pressable>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, padding: 24 },
    description: { fontSize: 15, color: c.text, lineHeight: 21, marginBottom: 24 },
    button: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    buttonText: { color: c.onPrimary, fontWeight: '700', fontSize: 16 },
    error: { color: c.danger, marginTop: 16 },
  });
