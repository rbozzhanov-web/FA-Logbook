import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { NewLogEntry, createEntries } from '@/src/db/queries/entries';
import { hasNoHours, missingRequiredFields } from '@/src/lib/pdfImport/candidateCompleteness';
import { minutesToHHMM } from '@/src/lib/time';
import { useImportDraftStore } from '@/src/store/importDraft';
import { AppColors, useAppTheme } from '@/src/theme';
import { v4 as uuidv4 } from 'uuid';

export default function ImportReviewScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { candidates, crossChecks, subject, clear } = useImportDraftStore();
  const [included, setIncluded] = useState<boolean[]>(() =>
    candidates.map((candidate) => !candidate.isDuplicate && candidate.confidence !== 'low'),
  );
  const [importBatchId] = useState(() => uuidv4());
  const [saving, setSaving] = useState(false);

  const includedCount = included.filter(Boolean).length;

  const summary = useMemo(() => {
    const duplicateCount = candidates.filter((c) => c.isDuplicate).length;
    const needsReviewCount = candidates.filter((c) => c.confidence !== 'high').length;
    return { duplicateCount, needsReviewCount };
  }, [candidates]);

  const save = async (toSave: NewLogEntry[]) => {
    setSaving(true);
    try {
      await createEntries(toSave);
      clear();
      router.dismissTo('/');
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    if (includedCount === 0) {
      Alert.alert('Nothing selected', 'Include at least one entry to save.');
      return;
    }

    const includedCandidates = candidates.filter((_, index) => included[index]);
    const incomplete = includedCandidates.filter(
      (candidate) => missingRequiredFields(candidate.fields).length > 0 || hasNoHours(candidate.fields),
    );
    if (incomplete.length > 0) {
      Alert.alert(
        'Some entries need more info',
        `${incomplete.length} selected ${incomplete.length === 1 ? 'entry is' : 'entries are'} missing a date, a station, or any hours. Edit them or turn them off before saving.`,
      );
      return;
    }

    save(
      includedCandidates.map((candidate) => ({
        ...(candidate.fields as NewLogEntry),
        importBatchId,
      })),
    );
  };

  if (candidates.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Nothing to review.</Text>
        <Text style={styles.emptySubtext}>
          {subject
            ? 'The roster was recognised, but no duties were read from it.'
            : 'This file was not recognised as a crew schedule report.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryBar}>
        {subject && (
          <Text style={styles.subject}>
            {subject.name}
            {subject.rank ? ` · ${subject.rank}` : ''}
            {subject.periodStart ? ` · ${subject.periodStart} to ${subject.periodEnd}` : ''}
          </Text>
        )}
        <Text style={styles.summaryText}>
          {candidates.length} {candidates.length === 1 ? 'entry' : 'entries'} found ·{' '}
          {summary.duplicateCount} already in logbook · {summary.needsReviewCount} need review
        </Text>
        {crossChecks.map((check, index) => (
          <View key={index} style={styles.crossCheckBlock}>
            <Text
              style={[
                styles.crossCheck,
                check.informational
                  ? styles.crossCheckInfo
                  : check.matches
                    ? styles.crossCheckOk
                    : styles.crossCheckBad,
              ]}
            >
              {check.label}: this import {minutesToHHMM(check.parsedTotalMinutes)} · report{' '}
              {minutesToHHMM(check.reportedTotalMinutes)}
              {check.informational ? '' : check.matches ? ' ✓' : ' ✗'}
            </Text>
            {check.note && <Text style={styles.crossCheckNote}>{check.note}</Text>}
          </View>
        ))}
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item: candidate, index }) => {
          const fields = candidate.fields;
          const isGround = fields.kind === 'ground';
          const isAbsence = fields.kind === 'absence';
          const minutes =
            (fields.blockMinutes ?? 0) + (fields.deadheadMinutes ?? 0) + (fields.groundDutyMinutes ?? 0);

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.route}>
                  {isGround || isAbsence
                    ? (fields.dutyCode ?? (isAbsence ? 'Absence' : 'Ground duty'))
                    : `${fields.departureAirport ?? '?'} → ${fields.arrivalAirport ?? '?'}`}
                </Text>
                <Switch
                  value={included[index]}
                  onValueChange={(value) =>
                    setIncluded((prev) => prev.map((v, i) => (i === index ? value : v)))
                  }
                />
              </View>
              <Text style={styles.meta}>
                {[
                  fields.date ?? 'unknown date',
                  fields.flightNumber,
                  fields.aircraftType,
                  minutes > 0 ? minutesToHHMM(minutes) : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>

              {candidate.unmatchedFields.length > 0 && (
                <View style={styles.issues}>
                  {candidate.unmatchedFields.map((issue) => (
                    <Text key={issue} style={styles.issueText}>
                      • {issue}
                    </Text>
                  ))}
                </View>
              )}

              <View style={styles.badgeRow}>
                <Badge label={confidenceLabel(candidate.confidence)} tone={confidenceTone(candidate.confidence)} />
                {candidate.isDuplicate && <Badge label="Already in logbook" tone="warn" />}
                {fields.kind === 'deadhead' && <Badge label="Deadhead" tone="neutral" />}
                {!isGround && (fields.nightMinutes ?? 0) > 0 && (
                  <Badge label={`Night ${minutesToHHMM(fields.nightMinutes!)}`} tone="neutral" />
                )}
              </View>

              <Pressable
                style={styles.editButton}
                onPress={() =>
                  router.push({ pathname: '/import/review-edit/[index]', params: { index: String(index) } })
                }
              >
                <Text style={styles.editButtonText}>Edit before saving</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <Pressable style={styles.saveButton} onPress={confirmSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : `Save ${includedCount} entries`}</Text>
      </Pressable>
    </View>
  );
}

function confidenceLabel(confidence: string): string {
  if (confidence === 'high') return 'Looks good';
  if (confidence === 'medium') return 'Check this';
  return 'Incomplete';
}

function confidenceTone(confidence: string): 'ok' | 'warn' | 'bad' {
  if (confidence === 'high') return 'ok';
  if (confidence === 'medium') return 'warn';
  return 'bad';
}

function Badge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyText: { color: c.text, fontSize: 16, fontWeight: '600' },
    emptySubtext: { color: c.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' },
    summaryBar: { padding: 16, backgroundColor: c.surfaceAlt, gap: 4 },
    subject: { fontSize: 14, fontWeight: '700', color: c.text },
    summaryText: { fontSize: 13, color: c.text },
    crossCheckBlock: { marginTop: 4 },
    crossCheck: { fontSize: 12, fontWeight: '600' },
    crossCheckOk: { color: c.success },
    crossCheckBad: { color: c.danger },
    crossCheckInfo: { color: c.textMuted },
    crossCheckNote: { fontSize: 11, color: c.textMuted, lineHeight: 15, marginTop: 1 },
    card: {
      padding: 16,
      backgroundColor: c.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    route: { fontSize: 16, fontWeight: '600', color: c.text },
    meta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    issues: {
      marginTop: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: c.badgeWarn,
      gap: 2,
    },
    issueText: { fontSize: 12, color: c.badgeWarnText, lineHeight: 17 },
    badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    badge_ok: { backgroundColor: c.badgeOk },
    badge_warn: { backgroundColor: c.badgeWarn },
    badge_bad: { backgroundColor: c.badgeBad },
    badge_neutral: { backgroundColor: c.badgeNeutral },
    badgeText: { fontSize: 11, fontWeight: '600', color: c.text },
    badgeText_ok: { color: c.badgeOkText },
    badgeText_warn: { color: c.badgeWarnText },
    badgeText_bad: { color: c.badgeBadText },
    badgeText_neutral: { color: c.badgeNeutralText },
    editButton: { marginTop: 10, alignSelf: 'flex-start' },
    editButtonText: { color: c.primary, fontWeight: '600', fontSize: 13 },
    saveButton: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      margin: 16,
    },
    saveButtonText: { color: c.onPrimary, fontWeight: '700', fontSize: 16 },
  });
