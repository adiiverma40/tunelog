
import { useState, useRef, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import {
  fetchImportCSV,
  fetchCreatePlaylistFromIds,
  ImportResponse,
} from "../../API/API";

function getUsersFromCache(): string[] {
  try {
    const raw = localStorage.getItem("tunelog_users_cache");
    if (raw) {
      const parsed = JSON.parse(raw) as { username: string }[];
      return parsed.map((u) => u.username);
    }
  } catch {}
  const fallback =
    localStorage.getItem("tunelog_user") ??
    sessionStorage.getItem("tunelog_user");
  return fallback ? [fallback] : [];
}

export default function Import() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importError, setImportError] = useState("");

  const [playlistName, setPlaylistName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { isOpen, openModal, closeModal } = useModal();

  useEffect(() => {
    if (isOpen) {
      const users = getUsersFromCache();
      setAllUsers(users);
      setSelectedUsers(users); 
    }
  }, [isOpen]);

  const allSelected =
    selectedUsers.length === allUsers.length && allUsers.length > 0;

  const toggleAllUsers = () => {
    setSelectedUsers(allSelected ? [] : [...allUsers]);
  };

  const toggleUser = (username: string) => {
    setSelectedUsers((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username],
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setImportError("");
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setImportError("Please select a CSV file first.");
      return;
    }
    setImporting(true);
    setImportError("");
    try {
      const result = await fetchImportCSV(selectedFile);
      setImportResult(result);
      if (result.status === "success") {
        openModal();
      } else {
        setImportError(result.reason ?? "Import failed.");
      }
    } catch {
      setImportError("Something went wrong during import.");
    } finally {
      setImporting(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!playlistName.trim()) {
      setCreateMsg("Enter a playlist name.");
      return;
    }
    if (!importResult?.data?.matched_ids?.length) {
      setCreateMsg("No matched songs to add.");
      return;
    }
    if (selectedUsers.length === 0) {
      setCreateMsg("Select at least one user.");
      return;
    }

    setCreating(true);
    setCreateMsg("");

    try {
      const res = await fetchCreatePlaylistFromIds({
        username: selectedUsers,
        song_ids: importResult.data.matched_ids,
        playlist_name: playlistName.trim(),
      });

      if (res.status === "success" || res.status === "ok") {
        setCreateMsg(
          `✓ Playlist "${playlistName}" created for ${selectedUsers.length} user(s)!`,
        );
        setTimeout(() => {
          closeModal();
          setCreateMsg("");
          setPlaylistName("");
          setImportResult(null);
          setSelectedFile(null);
          setSelectedUsers([]);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }, 1500);
      } else {
        setCreateMsg(res.reason ?? res.message ?? "Failed to create playlist.");
      }
    } catch {
      setCreateMsg("Error creating playlist.");
    } finally {
      setCreating(false);
    }
  };

  const summary = importResult?.data?.summary;
  const results = importResult?.data?.results ?? [];
  const matched = results.filter((r) => r.found);
  const unmatched = results.filter((r) => !r.found);

  return (
    <>
      <PageMeta
        title="Import | TuneLog"
        description="Import a CSV file and create a playlist from matched songs"
      />
      <PageBreadcrumb pageTitle="Import" />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] max-w-xl">
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
          Import from CSV
        </h4>
        <p className="text-sm text-gray-400 mb-6">
          Upload a CSV with Track Name, Artist Name, Album Name, and Duration
          columns. TuneLog will fuzzy-match songs from your library and let you
          save them as a playlist.
        </p>

        <div className="space-y-5">
          <div>
            <Label>CSV File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border file:border-gray-200 dark:file:border-gray-700
                file:text-sm file:font-medium
                file:bg-white dark:file:bg-gray-900
                file:text-gray-700 dark:file:text-gray-300
                hover:file:border-brand-500 hover:file:text-brand-500
                cursor-pointer"
            />
            {selectedFile && (
              <p className="mt-1.5 text-xs text-gray-400">
                Selected:{" "}
                <span className="text-gray-600 dark:text-gray-300 font-medium">
                  {selectedFile.name}
                </span>{" "}
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {importError && <p className="text-sm text-red-400">{importError}</p>}

          <Button
            onClick={handleImport}
            disabled={!selectedFile || importing}
            size="sm"
          >
            {importing ? "Matching songs..." : "⚡ Import & Match"}
          </Button>
        </div>

        <hr className="my-6 border-gray-100 dark:border-gray-800" />

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Expected CSV columns
          </p>
          {["Track Name", "Artist Name", "Album Name", "Duration"].map(
            (col) => (
              <div
                key={col}
                className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                {col}
              </div>
            ),
          )}
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[680px] m-4">
        <div className="no-scrollbar relative w-full max-w-[680px] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 lg:p-10 max-h-[85vh]">
          <h4 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-1">
            Match Results
          </h4>
          {summary && (
            <p className="text-sm text-gray-400 mb-6">
              {summary.matched} of {summary.total} songs matched
            </p>
          )}

          {summary && (
            <div className="flex gap-3 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-400/10 border border-green-400/20">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  {summary.matched} matched
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 border border-red-400/20">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-xs font-medium text-red-500 dark:text-red-400">
                  {summary.not_found} not found
                </span>
              </div>
            </div>
          )}

          {matched.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Matched Songs
              </p>
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                {matched.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl border border-green-300/30 bg-green-400/5 dark:border-green-800/30 dark:bg-green-900/10"
                  >
                    <span className="text-green-500 flex-shrink-0 text-sm">
                      ✓
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                        {r.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {r.artist}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Not Found
              </p>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                {unmatched.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl border border-red-300/30 bg-red-400/5 dark:border-red-800/30 dark:bg-red-900/10"
                  >
                    <span className="text-red-400 flex-shrink-0 text-sm">
                      ✗
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        {r.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {r.artist}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <hr className="border-gray-100 dark:border-gray-800 mb-5" />

          {matched.length > 0 ? (
            <div className="space-y-4">
              {allUsers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Create for
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <div
                        onClick={toggleAllUsers}
                        className={`h-4 w-4 rounded flex items-center justify-center border transition-colors cursor-pointer flex-shrink-0
                          ${
                            allSelected
                              ? "bg-brand-500 border-brand-500"
                              : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          }`}
                      >
                        {allSelected && (
                          <svg
                            className="w-2.5 h-2.5 text-white"
                            fill="none"
                            viewBox="0 0 10 8"
                          >
                            <path
                              d="M1 4l3 3 5-6"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        All users
                      </span>
                      <span className="text-xs text-gray-400">
                        ({allUsers.length})
                      </span>
                    </label>

                    <div className="ml-1 flex flex-col gap-1.5 pl-3 border-l border-gray-100 dark:border-gray-800">
                      {allUsers.map((username) => (
                        <label
                          key={username}
                          className="flex items-center gap-2.5 cursor-pointer"
                        >
                          <div
                            onClick={() => toggleUser(username)}
                            className={`h-4 w-4 rounded flex items-center justify-center border transition-colors cursor-pointer flex-shrink-0
                              ${
                                selectedUsers.includes(username)
                                  ? "bg-brand-500 border-brand-500"
                                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                              }`}
                          >
                            {selectedUsers.includes(username) && (
                              <svg
                                className="w-2.5 h-2.5 text-white"
                                fill="none"
                                viewBox="0 0 10 8"
                              >
                                <path
                                  d="M1 4l3 3 5-6"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {username}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label>Playlist Name</Label>
                <Input
                  type="text"
                  placeholder="e.g. My Imported Playlist"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                />
              </div>

              {createMsg && (
                <p
                  className={`text-sm ${createMsg.startsWith("✓") ? "text-green-500" : "text-red-400"}`}
                >
                  {createMsg}
                </p>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button size="sm" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreatePlaylist}
                  disabled={
                    creating ||
                    !playlistName.trim() ||
                    selectedUsers.length === 0
                  }
                >
                  {creating
                    ? "Creating..."
                    : `Create Playlist (${matched.length} songs${selectedUsers.length > 1 ? `, ${selectedUsers.length} users` : ""})`}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={closeModal}>
                Close
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}