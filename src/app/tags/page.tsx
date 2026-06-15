"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Tags as TagsIcon } from "lucide-react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ConfirmModal from "@/components/ConfirmModal";
import ModalOverlay from "@/components/ModalOverlay";
import { TAG_COLORS } from "@/lib/flow";
import type { SanitizedUser, Tag, TaggableKind } from "@/lib/types";

/** Entity option shown in the assignment picker. */
interface EntityOption {
  id: string;
  label: string;
}

type EntityMap = Record<TaggableKind, EntityOption[]>;

/** Taggable kinds, their API source, and which field to display as the label. */
const KIND_GROUPS: { kind: TaggableKind; label: string; api: string; labelField: "name" | "slug" }[] = [
  { kind: "endpoint", label: "Endpoints", api: "/api/endpoints", labelField: "slug" },
  { kind: "destination", label: "Destinations", api: "/api/destinations", labelField: "name" },
  { kind: "transfer", label: "Transfers", api: "/api/transfers", labelField: "name" },
  { kind: "integration", label: "Integrations", api: "/api/integrations", labelField: "name" },
  { kind: "sftp", label: "SFTP Connections", api: "/api/sftp-connections", labelField: "name" },
  { kind: "soap", label: "SOAP Connections", api: "/api/soap-connections", labelField: "name" },
  { kind: "ftp", label: "FTP Connections", api: "/api/ftp-connections", labelField: "name" },
];

const EMPTY_ENTITIES: EntityMap = {
  endpoint: [], destination: [], transfer: [], integration: [], sftp: [], soap: [], ftp: [],
};

const memberKey = (type: TaggableKind, id: string) => `${type}:${id}`;

export default function TagsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [entities, setEntities] = useState<EntityMap>(EMPTY_ENTITIES);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Tag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fColor, setFColor] = useState(TAG_COLORS[0]);
  const [fDesc, setFDesc] = useState("");
  const [fMembers, setFMembers] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchTags = useCallback(() => {
    fetch("/api/tags").then((r) => r.json()).then((data) => {
      setTags(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const fetchEntities = useCallback(async () => {
    const results = await Promise.all(
      KIND_GROUPS.map(async (g) => {
        try {
          const res = await fetch(g.api);
          const data = await res.json();
          const list: EntityOption[] = Array.isArray(data)
            ? data.map((e: Record<string, string>) => ({ id: e.id, label: e[g.labelField] || e.id }))
            : [];
          return [g.kind, list] as const;
        } catch {
          return [g.kind, [] as EntityOption[]] as const;
        }
      }),
    );
    setEntities({ ...EMPTY_ENTITIES, ...Object.fromEntries(results) } as EntityMap);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchTags();
    fetchEntities();
  }, [user, fetchTags, fetchEntities]);

  const openCreate = () => {
    setEditTarget(null);
    setFName(""); setFColor(TAG_COLORS[0]); setFDesc(""); setFMembers(new Set());
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (t: Tag) => {
    setEditTarget(t);
    setFName(t.name); setFColor(t.color); setFDesc(t.description || "");
    setFMembers(new Set(t.members.map((m) => memberKey(m.type, m.id))));
    setFormError("");
    setShowModal(true);
  };

  const toggleMember = (key: string) => {
    setFMembers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    setFormError("");
    const members = [...fMembers].map((key) => {
      const idx = key.indexOf(":");
      return { type: key.slice(0, idx) as TaggableKind, id: key.slice(idx + 1) };
    });
    const body = { name: fName, color: fColor, description: fDesc, members };
    const url = editTarget ? `/api/tags/${editTarget.id}` : "/api/tags";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Failed"); return; }
    setShowModal(false);
    fetchTags();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/tags/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchTags();
  };

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  const selectedCount = fMembers.size;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Tags</h1>
            <button className="btn btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> Add Tag</button>
          </div>

          {tags.length === 0 && !loading ? (
            <div className="empty-state">
              <TagsIcon className="empty-state-icon" />
              <p className="empty-state-title">No tags yet</p>
              <p className="empty-state-description">Create a tag to group items across modules and visualize them on the flow map.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Description</th><th>Members</th><th>Actions</th></tr></thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
                        <span className="font-medium text-text-primary">{t.name}</span>
                      </span>
                    </td>
                    <td className="text-text-secondary">{t.description || "—"}</td>
                    <td><span className="badge badge-muted">{t.members.length}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setDeleteTarget(t)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Create/Edit Modal */}
          {showModal && (
            <ModalOverlay onClose={() => setShowModal(false)} maxWidth={560}>
              <div className="modal-header">
                <h2>{editTarget ? "Edit Tag" : "New Tag"}</h2>
                <button onClick={() => setShowModal(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body space-y-4">
                <div>
                  <label className="input-label">Name</label>
                  <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Payroll pipeline" />
                </div>
                <div>
                  <label className="input-label">Color</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFColor(c)}
                        title={c}
                        className="w-7 h-7 rounded-full"
                        style={{ background: c, outline: fColor === c ? "2px solid var(--color-text-primary)" : "none", outlineOffset: 2 }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="input-label">Description</label>
                  <input className="input" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Members {selectedCount > 0 ? `(${selectedCount})` : ""}</label>
                  <div className="border border-border rounded-lg max-h-72 overflow-y-auto p-3 space-y-3">
                    {KIND_GROUPS.map((g) => (
                      <div key={g.kind}>
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">{g.label}</p>
                        {entities[g.kind].length === 0 ? (
                          <p className="text-xs text-text-muted">None configured</p>
                        ) : (
                          <div className="space-y-1">
                            {entities[g.kind].map((opt) => {
                              const key = memberKey(g.kind, opt.id);
                              return (
                                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input type="checkbox" checked={fMembers.has(key)} onChange={() => toggleMember(key)} />
                                  <span className="text-text-primary">{opt.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {formError && <p className="text-sm text-red-500">{formError}</p>}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSubmit}>{editTarget ? "Save Changes" : "Create"}</button>
              </div>
            </ModalOverlay>
          )}

          <ConfirmModal
            isOpen={!!deleteTarget}
            title="Delete Tag"
            message={`Are you sure you want to delete "${deleteTarget?.name}"? This only removes the tag, not the items it groups.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        </div>
      </div>
    </div>
  );
}
