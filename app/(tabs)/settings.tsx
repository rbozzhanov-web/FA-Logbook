import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDataRefresh } from '@/src/db/dataVersion';
import {
  deleteImportBatch,
  listEntries,
  listImportBatches,
  replaceAllEntries,
  restoreEntries,
} from '@/src/db/queries/entries';
import {
  AUTO_BACKUP_SUPPORTED,
  pickBackupText,
  readBackupStatus,
  shareBackup,
  sharePdf,
} from '@/src/lib/backup/backupFile';
import { mergeBackup, parseBackup } from '@/src/lib/backup/format';
import { NightWindowField } from '@/src/components/NightWindowField';
import { PaySchemeField } from '@/src/components/PaySchemeField';
import { ScreenTitle } from '@/src/components/ScreenTitle';
import {
  DEFAULT_NIGHT_WINDOW,
  NightWindow,
  describeNightWindow,
  serializeNightWindow,
} from '@/src/lib/daynight/nightWindow';
import { timezoneSupportAvailable } from '@/src/lib/daynight/localTime';
import { confirm, notify } from '@/src/lib/dialogs';
import { DEFAULT_PAY_SCHEME, PayScheme } from '@/src/lib/pay/payScheme';
import { readNightWindow, readPayScheme, writeNightWindow, writePayScheme } from '@/src/lib/settings';
import { AppColors, useAppTheme } from '@/src/theme';

interface ImportBatch {
  importBatchId: string;
  count: number;
  date: string;
}

type Busy = 'export' | 'pdf' | 'restore' | 'replace' | undefined;

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [backupStatus, setBackupStatus] = useState(readBackupStatus);
  const [nightWindow, setNightWindow] = useState<NightWindow>(DEFAULT_NIGHT_WINDOW);
  const [payScheme, setPayScheme] = useState<PayScheme>(DEFAULT_PAY_SCHEME);
  const [busy, setBusy] = useState<Busy>(undefined);

  // Checked once, at the top of the screen it would affect: without IANA timezone support the
  // app cannot convert a station-local roster time into a real instant, so every block time and
  // night figure would be wrong. Better to say so than to report confident nonsense.
  const timezonesWork = useMemo(timezoneSupportAvailable, []);

  const reload = useCallback(() => {
    listImportBatches().then(setBatches);
    readNightWindow().then(setNightWindow);
    readPayScheme().then(setPayScheme);
    setBackupStatus(readBackupStatus());
  }, []);

  useDataRefresh(reload);

  const changeNightWindow = async (window: NightWindow) => {
    setNightWindow(window);
    await writeNightWindow(window);
  };

  const changePayScheme = async (scheme: PayScheme) => {
    setPayScheme(scheme);
    await writePayScheme(scheme);
  };

  const confirmUndo = async (batch: ImportBatch) => {
    const ok = await confirm(
      'Undo import?',
      `This removes ${batch.count} ${batch.count === 1 ? 'entry' : 'entries'} imported together on ${new Date(
        batch.date,
      ).toLocaleDateString()}.`,
      { confirmLabel: 'Undo import', destructive: true },
    );
    if (!ok) return;

    await deleteImportBatch(batch.importBatchId);
    reload();
  };

  const runExport = async () => {
    setBusy('export');
    try {
      await shareBackup(await listEntries(), serializeNightWindow(nightWindow));
      setBackupStatus(readBackupStatus());
    } catch (error) {
      notify('Could not export', (error as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const runPdf = async () => {
    setBusy('pdf');
    try {
      await sharePdf(await listEntries(), nightWindow);
    } catch (error) {
      notify('Could not build the PDF', (error as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * Merge and replace share everything up to the confirmation, so the counts shown are always the
   * counts computed from the file actually picked.
   */
  const runRestore = async (mode: 'merge' | 'replace') => {
    setBusy(mode === 'merge' ? 'restore' : 'replace');
    try {
      const raw = await pickBackupText();
      if (raw === undefined) return;

      const parsed = parseBackup(raw);
      if (!parsed.ok) {
        notify('Could not read that backup', parsed.error);
        return;
      }

      const incoming = parsed.backup.entries;
      const existing = await listEntries();
      const { added, updated, unchanged } = mergeBackup(existing, incoming);

      const message =
        mode === 'merge'
          ? `${added} new, ${updated} updated, ${unchanged} unchanged. Nothing already in this logbook is deleted.`
          : `This deletes all ${existing.length} ${
              existing.length === 1 ? 'entry' : 'entries'
            } on this device and leaves only the ${incoming.length} in the backup.`;

      const ok = await confirm(
        mode === 'merge' ? 'Restore this backup?' : 'Replace the whole logbook?',
        message,
        {
          confirmLabel: mode === 'merge' ? 'Restore' : 'Replace everything',
          destructive: mode === 'replace',
        },
      );
      if (!ok) return;

      if (mode === 'merge') await restoreEntries(incoming);
      else await replaceAllEntries(incoming);

      reload();
      notify(
        'Restored',
        mode === 'merge'
          ? `${added} ${added === 1 ? 'entry' : 'entries'} added, ${updated} updated.`
          : `The logbook now holds ${incoming.length} ${incoming.length === 1 ? 'entry' : 'entries'}.`,
      );
    } catch (error) {
      notify('Could not restore', (error as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const backupHint = AUTO_BACKUP_SUPPORTED
    ? backupStatus.modifiedAt
      ? `Saved automatically after every change. Last written ${backupStatus.modifiedAt.toLocaleString()} — find it in Files → On My iPhone → FA Logbook.`
      : 'Saved automatically after every change, into Files → On My iPhone → FA Logbook.'
    : 'A browser cannot save a file on its own, so export manually before switching device.';

  return (
    <View style={styles.screen}>
      <ScreenTitle title="Settings" />
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={batches}
        keyExtractor={(item) => item.importBatchId}
        ListHeaderComponent={
          <>
            {!timezonesWork && (
              <View style={styles.warning}>
                <Text style={styles.warningTitle}>Timezones unavailable on this device</Text>
                <Text style={styles.warningText}>
                  Rosters state their times in local station time, so block times and night hours
                  cannot be computed without timezone data. Figures on this device may be wrong.
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Night hours</Text>
            <Text style={styles.hint}>
              Night is reported two ways. The actual figure — how much was flown in real darkness —
              comes from the sun&apos;s position along each route and never changes. The
              contractual figure counts a clock window, which is whatever your agreement says, so
              you set it here. It is currently {describeNightWindow(nightWindow)}.
            </Text>
            <NightWindowField value={nightWindow} onChange={changeNightWindow} />

            <Text style={[styles.sectionTitle, styles.laterSection]}>Pay</Text>
            <Text style={styles.hint}>
              The agreement the Pay tab computes against. Every term here is a clause of a
              contract rather than a fact about flying, so all of it is editable — the rate, the
              bands, the multipliers and the deductions.
            </Text>
            <PaySchemeField value={payScheme} onChange={changePayScheme} />

            <Text style={[styles.sectionTitle, styles.laterSection]}>Backup &amp; export</Text>
            <Text style={styles.hint}>{backupHint}</Text>

            <ActionButton label="Export backup file" onPress={runExport} busy={busy === 'export'} disabled={!!busy} />
            <ActionButton label="Export PDF logbook" onPress={runPdf} busy={busy === 'pdf'} disabled={!!busy} />
            <ActionButton
              label="Restore from a backup"
              onPress={() => runRestore('merge')}
              busy={busy === 'restore'}
              disabled={!!busy}
            />
            <ActionButton
              label="Replace everything from a backup"
              onPress={() => runRestore('replace')}
              busy={busy === 'replace'}
              disabled={!!busy}
              destructive
            />
            <Text style={styles.hint}>
              Restoring merges by entry, so the same backup can be restored twice without
              duplicating anything.
            </Text>

            <Text style={[styles.sectionTitle, styles.laterSection]}>Import history</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No roster imports yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>
                {item.count} {item.count === 1 ? 'entry' : 'entries'}
              </Text>
              <Text style={styles.rowMeta}>{new Date(item.date).toLocaleString()}</Text>
            </View>
            <Pressable style={styles.undoButton} onPress={() => confirmUndo(item)}>
              <Text style={styles.undoButtonText}>Undo</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  busy,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={[styles.actionButton, destructive && styles.destructiveButton, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      {busy ? (
        <ActivityIndicator color={destructive ? colors.danger : colors.text} />
      ) : (
        <Text style={[styles.actionButtonText, destructive && styles.destructiveButtonText]}>{label}</Text>
      )}
    </Pressable>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: c.text },
    laterSection: { marginTop: 28 },
    hint: { fontSize: 12, color: c.textMuted, marginBottom: 12, lineHeight: 17 },
    warning: {
      backgroundColor: c.badgeBad,
      borderRadius: 10,
      padding: 12,
      marginBottom: 20,
    },
    warningTitle: { fontSize: 14, fontWeight: '700', color: c.badgeBadText, marginBottom: 4 },
    warningText: { fontSize: 12, color: c.badgeBadText, lineHeight: 17 },
    actionButton: {
      borderWidth: 1,
      borderColor: c.accent,
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 8,
      minHeight: 44,
      justifyContent: 'center',
    },
    actionButtonText: { color: c.text, fontWeight: '600' },
    actionDisabled: { opacity: 0.5 },
    destructiveButton: { borderColor: c.danger, backgroundColor: 'transparent' },
    destructiveButtonText: { color: c.danger },
    emptyText: { color: c.textMuted },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    rowMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    undoButton: { paddingHorizontal: 12, paddingVertical: 8 },
    undoButtonText: { color: c.danger, fontWeight: '600' },
  });
