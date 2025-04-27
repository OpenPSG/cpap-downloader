// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { EDFAnnotation, EDFSignal } from "edf-ts";
import { EDFFile } from "./Loader";

// Convert labels to their canonical form based on a provided mapping.
export function canonicalizeLabels(
  signals: EDFSignal[],
  synonyms: Map<string, string[]>,
): EDFSignal[] {
  const canonicalizedSignals = signals.map((signal) => {
    for (const [canonical, aliases] of synonyms.entries()) {
      if (aliases.some((alias) => alias === signal.label)) {
        return { ...signal, label: canonical };
      }
    }
    return signal;
  });

  return canonicalizedSignals;
}

// Filter signals based on labels.
export function filterSignals(
  signals: EDFSignal[],
  values: number[][],
  filter: {
    allowedLabels?: string[];
    disallowedLabels?: string[];
  },
): { filteredSignals: EDFSignal[]; filteredValues: number[][] } {
  const allowedSet = filter.allowedLabels
    ? new Set(filter.allowedLabels.map((label) => label.toLowerCase()))
    : undefined;
  const disallowedSet = filter.disallowedLabels
    ? new Set(filter.disallowedLabels.map((label) => label.toLowerCase()))
    : undefined;

  const filteredSignals: EDFSignal[] = [];
  const filteredValues: number[][] = [];

  signals.forEach((signal, idx) => {
    const label = signal.label.toLowerCase();

    // If allowedLabels is provided, keep only if label is in allowedSet
    if (allowedSet && !allowedSet.has(label)) {
      return;
    }

    // If disallowedLabels is provided, skip if label is in disallowedSet
    if (disallowedSet && disallowedSet.has(label)) {
      return;
    }

    filteredSignals.push(signal);
    filteredValues.push(values[idx]);
  });

  return { filteredSignals, filteredValues };
}

export interface EDFFileWithDuration extends EDFFile {
  // The duration of the EDF file in seconds.
  duration: number;
}

// Find the common time range across multiple EDF files and align it to the nearest record boundary.
export function findCommonTimeRange(
  files: EDFFileWithDuration[],
  recordDuration: number,
): {
  start: Date;
  end: Date;
} {
  const startTimes = files.map((file) => file.header.startTime.getTime());
  const endTimes = files.map(
    (file) => file.header.startTime.getTime() + (file.duration ?? 0) * 1000,
  );

  const start = Math.max(...startTimes);

  let end = Math.min(...endTimes);
  // Align the end time to the nearest record boundary.
  end -= (end - start) % (recordDuration * 1000);

  return {
    start: new Date(start),
    end: new Date(end),
  };
}

// Merge signals from multiple EDF files.
export function mergeSignals(
  start: Date,
  end: Date,
  overlappingFiles: EDFFile[],
): { signals: EDFSignal[]; values: number[][]; annotations: EDFAnnotation[] } {
  const labelToSignals = new Map<
    string,
    { signal: EDFSignal; index: number; fileIndex: number }[]
  >();

  // Step 1: Group all signals by label
  overlappingFiles.forEach((file, fileIndex) => {
    file.header.signals.forEach((signal, signalIndex) => {
      if (!labelToSignals.has(signal.label)) {
        labelToSignals.set(signal.label, []);
      }
      labelToSignals
        .get(signal.label)!
        .push({ signal, index: signalIndex, fileIndex });
    });
  });

  const mergedSignals: EDFSignal[] = [];
  const mergedValues: number[][] = [];

  // Step 2: For each label, pick the best signal (highest samplesPerRecord)
  for (const signalInfos of labelToSignals.values()) {
    signalInfos.sort(
      (a, b) => b.signal.samplesPerRecord - a.signal.samplesPerRecord,
    );
    const best = signalInfos[0];

    mergedSignals.push(best.signal);

    const file = overlappingFiles[best.fileIndex];
    const values = file.values[best.index];

    const fileStart = file.header.startTime.getTime();
    const recordDurationMs = file.header.recordDuration * 1000;
    const samplesPerRecord = best.signal.samplesPerRecord;
    const samplesPerMs = samplesPerRecord / recordDurationMs;

    const startSample = Math.floor(
      (start.getTime() - fileStart) * samplesPerMs,
    );
    const endSample = Math.ceil((end.getTime() - fileStart) * samplesPerMs);

    const extractedSamples = values.slice(startSample, endSample);
    mergedValues.push(extractedSamples);
  }

  const mergedAnnotations: EDFAnnotation[] = [];

  overlappingFiles.forEach((file) => {
    file.annotations.forEach((annotation) => {
      if (
        file.header.startTime.getTime() + annotation.onset * 1000 >=
          start.getTime() &&
        file.header.startTime.getTime() + annotation.onset * 1000 <=
          end.getTime()
      ) {
        mergedAnnotations.push({
          ...annotation,
          onset:
            annotation.onset +
            (file.header.startTime.getTime() - start.getTime()) / 1000,
        });
      }
    });
  });

  return {
    signals: mergedSignals,
    values: mergedValues,
    annotations: mergedAnnotations,
  };
}
