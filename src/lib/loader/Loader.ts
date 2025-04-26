// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { EDFAnnotation, EDFHeader } from "edf-ts";

// CPAP Therapy Session.
export interface Session {
  // The start date of the session.
  start: Date;
  // The end date of the session.
  end: Date;
  // Files associated with this session.
  files: Map<string, File>;
}

// A Therapy Session in EDF+ format.
export interface EDFFile {
  // The EDF header information and signal metadata.
  header: EDFHeader;
  // The signal physical values.
  values: number[][];
  // The EDF annotations (events).
  annotations: EDFAnnotation[];
}

// CPAP Data Loader Interface
export interface Loader {
  // The name of the loader, e.g., "ResMed", "Philips".
  name: string;
  // Validate that the directory contains the necessary files for this loader.
  validateDirectory(directory: Map<string, File>): Promise<boolean>;
  // Get the list of therapy sessions stored in the directory.
  sessions(
    directory: Map<string, File>,
    onProgress?: (percent: number) => void,
  ): Promise<Session[]>;
  // Load a specific session and return the processed data in EDF+ format.
  loadSession(
    session: Session,
    onProgress?: (percent: number) => void,
  ): Promise<EDFFile>;
}
