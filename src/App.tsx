// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, AlertTriangle, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { EDFWriter } from "edf-ts";
import { Loader, Session } from "@/lib/loader/Loader";
import ResMedLoader from "@/lib/loader/ResMedLoader";

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [selectedLoader, setSelectedLoader] = useState<Loader | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  const loaders = useMemo(() => {
    return [new ResMedLoader()];
  }, []);

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      setFiles(selectedFiles);
      setError(null);
      setProgress(0);
      setSessions([]);

      setLoading(true);
      try {
        const directory = new Map<string, File>();
        selectedFiles.forEach((file) => {
          const f = file as File & { webkitRelativePath: string };
          const parts = f.webkitRelativePath.split("/");
          const relativePath = parts.slice(1).join("/");
          directory.set(relativePath, file);
        });

        // Find the appropriate loader for the files
        const loader = loaders.find((loader) =>
          loader.validateDirectory(directory),
        );
        if (!loader) {
          throw new Error(
            "Could not find a compatible CPAP loader for the selected directory.",
          );
        }
        setSelectedLoader(loader);

        const foundSessions = await loader.sessions(directory, setProgress);
        if (foundSessions.length === 0) {
          throw new Error("No valid sessions found in the selected directory.");
        }

        // Sort sessions by start time in descending order before displaying.
        foundSessions.sort((a, b) => b.start.getTime() - a.start.getTime());

        setSessions(foundSessions);
      } catch (err) {
        console.error(err);
        setError((err as Error).message);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [loaders],
  );

  const handleProcessSession = useCallback(
    async (session: Session) => {
      try {
        setError(null);
        setLoading(true);
        setProgress(0);

        const edfFile = await selectedLoader?.loadSession(session, setProgress);
        if (!edfFile) {
          throw new Error("Failed to load session data.");
        }

        // Turn it into a blob for download
        const writer = new EDFWriter(
          edfFile.header,
          edfFile.values,
          edfFile.annotations,
        );
        const mergedBuffer = writer.write();

        const blob = new Blob([mergedBuffer], {
          type: "application/octet-stream",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${format(session.start, "yyyy-MM-dd_HH-mm-ss")}.edf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(err);
        setError("An error occurred during EDF merge and download.");
      } finally {
        setLoading(false);
      }
    },
    [selectedLoader],
  );

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl shadow-xl">
        <CardHeader className="flex items-center gap-2">
          <FolderOpen className="w-6 h-6 text-blue-600" />
          <CardTitle className="text-xl">CPAP Downloader</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="font-semibold">Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-gray-600">Loading session details…</p>
              <Progress className="w-full" value={progress} />
              <span className="text-xs text-gray-500">
                {progress}% complete
              </span>
            </div>
          )}

          {!loading && files.length === 0 && (
            <>
              <p className="text-gray-600 text-sm">
                Select your CPAP SD card folder to begin creating an EDF+
                session file.
              </p>

              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer">
                <FolderOpen className="w-8 h-8 text-gray-500" />
                <span className="text-gray-700 text-sm">
                  Click to select SD card folder
                </span>
                <input
                  type="file"
                  multiple
                  // @ts-expect-error webkitdirectory is not a standard attribute
                  // but is supported by Chrome and Edge
                  webkitdirectory="true"
                  directory=""
                  className="hidden"
                  onChange={handleUpload}
                />
              </label>

              <hr className="w-full border-t border-gray-300 my-2" />
              <div className="text-xs text-left text-gray-400">
                Disclaimer: OpenPSG is not intended to diagnose, treat, cure, or
                prevent any medical condition. It is designed for research
                purposes only and should not be used as a substitute for
                professional medical advice or care. Users are responsible for
                ensuring compliance with the relevant regulations and standards
                in their region.
              </div>
              <div className="text-center">
                <a
                  href="/privacy.html"
                  className="text-blue-500 hover:underline text-xs"
                >
                  Privacy Policy
                </a>
              </div>
            </>
          )}

          {!loading && sessions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Select a session:
              </h3>
              <div className="flex flex-col gap-2">
                {sessions.map((session, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg shadow-sm border transition-colors cursor-pointer bg-white border-gray-200 hover:border-blue-300"
                    onClick={() => {
                      handleProcessSession(session);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="font-medium text-gray-800">
                          {session.start.toLocaleDateString()} —{" "}
                          {session.start.toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          Duration:{" "}
                          {Math.round(
                            (session.end.getTime() - session.start.getTime()) /
                              60000,
                          )}{" "}
                          min
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
