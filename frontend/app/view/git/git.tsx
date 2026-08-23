// Copyright 2026, Irfan Saf
// SPDX-License-Identifier: Apache-2.0

import type { BlockNodeModel } from "@/app/block/blocktypes";
import type { TabModel } from "@/app/store/tab-model";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { WaveEnv, WaveEnvSubset } from "@/app/waveenv/waveenv";
import { globalStore } from "@/store/jotaiStore";
import * as WOS from "@/store/wos";
import * as jotai from "jotai";
import { useEffect, useState } from "react";
import "./git.scss";

export type GitViewEnv = WaveEnvSubset<{
    rpc: {
        GitStatusCommand: WaveEnv["rpc"]["GitStatusCommand"];
        GitDiffCommand: WaveEnv["rpc"]["GitDiffCommand"];
        GitStageCommand: WaveEnv["rpc"]["GitStageCommand"];
        GitUnstageCommand: WaveEnv["rpc"]["GitUnstageCommand"];
        GitStageAllCommand: WaveEnv["rpc"]["GitStageAllCommand"];
        GitCommitCommand: WaveEnv["rpc"]["GitCommitCommand"];
        GitDiscardCommand: WaveEnv["rpc"]["GitDiscardCommand"];
        SetMetaCommand: WaveEnv["rpc"]["SetMetaCommand"];
    };
    wos: WaveEnv["wos"];
}>;

type SelectedFile = {
    path: string;
    staged: boolean;
} | null;

export class GitViewModel implements ViewModel {
    blockId: string;
    nodeModel: BlockNodeModel;
    tabModel: TabModel;
    env: GitViewEnv;
    viewType = "git";
    blockAtom: jotai.Atom<Block>;
    dirAtom: jotai.PrimitiveAtom<string>;
    statusAtom: jotai.PrimitiveAtom<GitStatusData | null>;
    selectedFileAtom: jotai.PrimitiveAtom<SelectedFile>;
    diffTextAtom: jotai.PrimitiveAtom<string>;
    commitMsgAtom: jotai.PrimitiveAtom<string>;
    errorAtom: jotai.PrimitiveAtom<string | null>;
    viewIcon: jotai.Atom<string>;
    viewName: jotai.Atom<string>;
    viewText: jotai.Atom<HeaderElem[]>;
    noPadding = jotai.atom<boolean>(true);

    constructor({ blockId, nodeModel, tabModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.tabModel = tabModel;
        this.env = waveEnv as GitViewEnv;
        this.blockAtom = this.env.wos.getWaveObjectAtom<Block>(`block:${blockId}`);
        const initialDir = (() => {
            const blockData = globalStore.get(this.blockAtom);
            return (blockData?.meta?.["git:dir"] as string) || "~";
        })();
        this.dirAtom = jotai.atom(initialDir) as jotai.PrimitiveAtom<string>;
        this.statusAtom = jotai.atom(null) as jotai.PrimitiveAtom<GitStatusData | null>;
        this.selectedFileAtom = jotai.atom(null) as jotai.PrimitiveAtom<SelectedFile>;
        this.diffTextAtom = jotai.atom("");
        this.commitMsgAtom = jotai.atom("");
        this.errorAtom = jotai.atom(null) as jotai.PrimitiveAtom<string | null>;
        this.viewIcon = jotai.atom("code-branch");
        this.viewName = jotai.atom("Git");
        this.viewText = jotai.atom((get) => {
            const status = get(this.statusAtom);
            const rtn: HeaderElem[] = [];
            if (status?.isrepo) {
                let branchText = status.branch;
                if (status.ahead > 0) branchText += ` ↑${status.ahead}`;
                if (status.behind > 0) branchText += ` ↓${status.behind}`;
                rtn.push({ elemtype: "text", text: branchText });
            }
            rtn.push({
                elemtype: "iconbutton",
                icon: "refresh",
                title: "Refresh",
                click: () => this.refresh(),
            });
            return rtn;
        });
    }

    get viewComponent(): ViewComponent {
        return GitView;
    }

    async refresh() {
        const dir = globalStore.get(this.dirAtom);
        try {
            const status = await this.env.rpc.GitStatusCommand(TabRpcClient, { dir });
            globalStore.set(this.statusAtom, status);
            globalStore.set(this.errorAtom, null);

            const selected = globalStore.get(this.selectedFileAtom);
            if (selected) {
                await this.loadDiff(selected.path, selected.staged);
            }
        } catch (e) {
            globalStore.set(this.errorAtom, `${e.message}`);
        }
    }

    async setDir(dir: string) {
        globalStore.set(this.dirAtom, dir);
        globalStore.set(this.selectedFileAtom, null);
        globalStore.set(this.diffTextAtom, "");
        // persist to block meta so tab restore remembers it
        const blockData = globalStore.get(this.blockAtom);
        if (blockData) {
            this.env.rpc.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { "git:dir": dir } as any,
            }).catch(() => {});
        }
        await this.refresh();
    }

    async loadDiff(path: string, staged: boolean) {
        const dir = globalStore.get(this.dirAtom);
        globalStore.set(this.selectedFileAtom, { path, staged });
        try {
            const diff = await this.env.rpc.GitDiffCommand(TabRpcClient, { dir, file: path, staged });
            globalStore.set(this.diffTextAtom, diff || "(no changes)");
        } catch (e) {
            globalStore.set(this.diffTextAtom, `Error loading diff: ${e.message}`);
        }
    }

    async stageFile(path: string) {
        const dir = globalStore.get(this.dirAtom);
        await this.env.rpc.GitStageCommand(TabRpcClient, { dir, file: path });
        await this.refresh();
    }

    async unstageFile(path: string) {
        const dir = globalStore.get(this.dirAtom);
        await this.env.rpc.GitUnstageCommand(TabRpcClient, { dir, file: path });
        await this.refresh();
    }

    async discardFile(path: string) {
        if (!confirm(`Discard all changes to ${path}? This cannot be undone.`)) {
            return;
        }
        const dir = globalStore.get(this.dirAtom);
        await this.env.rpc.GitDiscardCommand(TabRpcClient, { dir, file: path });
        await this.refresh();
    }

    async stageAll() {
        const dir = globalStore.get(this.dirAtom);
        await this.env.rpc.GitStageAllCommand(TabRpcClient, { dir });
        await this.refresh();
    }

    async commit() {
        const dir = globalStore.get(this.dirAtom);
        const message = globalStore.get(this.commitMsgAtom);
        if (!message.trim()) {
            return;
        }
        try {
            await this.env.rpc.GitCommitCommand(TabRpcClient, { dir, message });
            globalStore.set(this.commitMsgAtom, "");
            await this.refresh();
        } catch (e) {
            globalStore.set(this.errorAtom, `${e.message}`);
        }
    }
}

function statusLabel(status: string): { label: string; className: string } {
    switch (status) {
        case "M":
            return { label: "M", className: "git-status-modified" };
        case "A":
            return { label: "A", className: "git-status-added" };
        case "D":
            return { label: "D", className: "git-status-deleted" };
        case "R":
            return { label: "R", className: "git-status-renamed" };
        case "??":
            return { label: "U", className: "git-status-untracked" };
        default:
            return { label: status, className: "" };
    }
}

function FileRow({
    file,
    staged,
    model,
}: {
    file: GitFileEntry;
    staged: boolean;
    model: GitViewModel;
}) {
    const selected = jotai.useAtomValue(model.selectedFileAtom);
    const isSelected = selected?.path === file.path && selected?.staged === staged;
    const { label, className } = statusLabel(file.status);

    return (
        <div
            className={`git-file-row ${isSelected ? "git-file-row-selected" : ""}`}
            onClick={() => model.loadDiff(file.path, staged)}
        >
            <span className={`git-status-badge ${className}`}>{label}</span>
            <span className="git-file-path">{file.path}</span>
            <span className="git-file-actions">
                {staged ? (
                    <button
                        className="git-action-btn"
                        title="Unstage"
                        onClick={(e) => {
                            e.stopPropagation();
                            model.unstageFile(file.path);
                        }}
                    >
                        −
                    </button>
                ) : (
                    <>
                        <button
                            className="git-action-btn"
                            title="Stage"
                            onClick={(e) => {
                                e.stopPropagation();
                                model.stageFile(file.path);
                            }}
                        >
                            +
                        </button>
                        {file.status !== "??" && (
                            <button
                                className="git-action-btn git-action-btn-danger"
                                title="Discard"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    model.discardFile(file.path);
                                }}
                            >
                                ⨯
                            </button>
                        )}
                    </>
                )}
            </span>
        </div>
    );
}

function DiffLine({ line }: { line: string }) {
    let className = "git-diff-line";
    if (line.startsWith("+++") || line.startsWith("---")) {
        className += " git-diff-line-meta";
    } else if (line.startsWith("+")) {
        className += " git-diff-line-add";
    } else if (line.startsWith("-")) {
        className += " git-diff-line-remove";
    } else if (line.startsWith("@@")) {
        className += " git-diff-line-hunk";
    }
    return <div className={className}>{line || " "}</div>;
}

function fuzzyMatch(pattern: string, text: string): boolean {
    if (!pattern) return true;
    let pi = 0;
    for (let ti = 0; ti < text.length && pi < pattern.length; ti++) {
        if (text[ti].toLowerCase() === pattern[pi].toLowerCase()) pi++;
    }
    return pi === pattern.length;
}

function GitView({ model }: ViewComponentProps<GitViewModel>) {
    const status = jotai.useAtomValue(model.statusAtom);
    const diffText = jotai.useAtomValue(model.diffTextAtom);
    const selected = jotai.useAtomValue(model.selectedFileAtom);
    const error = jotai.useAtomValue(model.errorAtom);
    const dir = jotai.useAtomValue(model.dirAtom);
    const [commitMsg, setCommitMsg] = jotai.useAtom(model.commitMsgAtom);
    const [pathInput, setPathInput] = useState(dir);
    const [fileFilter, setFileFilter] = useState("");

    useEffect(() => {
        model.refresh();
    }, []);

    // sync pathInput when dir changes externally
    useEffect(() => {
        setPathInput(dir);
    }, [dir]);

    const handlePathSubmit = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            model.setDir(pathInput);
        }
    };

    const handleBrowse = async () => {
        const dir = await (window as any).api.showOpenDialog({
            title: "Select Git Repository",
            defaultPath: pathInput,
        });
        if (dir) {
            setPathInput(dir);
            model.setDir(dir);
        }
    };

    const filterFiles = (files: GitFileEntry[]): GitFileEntry[] => {
        if (!fileFilter) return files;
        return files.filter((f) => fuzzyMatch(fileFilter, f.path));
    };

    if (error) {
        return (
            <div className="git-view-container">
                <div className="git-sidebar">
                    <div className="git-path-bar">
                        <input
                            className="git-path-input"
                            value={pathInput}
                            onChange={(e) => setPathInput(e.target.value)}
                            onKeyDown={handlePathSubmit}
                            placeholder="Repository path..."
                            spellCheck={false}
                        />
                    </div>
                    <div className="git-error">{error}</div>
                </div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="git-view-container">
                <div className="git-sidebar">
                    <div className="git-path-bar">
                        <input
                            className="git-path-input"
                            value={pathInput}
                            onChange={(e) => setPathInput(e.target.value)}
                            onKeyDown={handlePathSubmit}
                            placeholder="Repository path..."
                            spellCheck={false}
                        />
                    </div>
                    <div className="git-loading">Loading...</div>
                </div>
            </div>
        );
    }

    if (!status.isrepo) {
        return (
            <div className="git-view-container">
                <div className="git-sidebar">
                    <div className="git-path-bar">
                        <input
                            className="git-path-input"
                            value={pathInput}
                            onChange={(e) => setPathInput(e.target.value)}
                            onKeyDown={handlePathSubmit}
                            placeholder="Repository path..."
                            spellCheck={false}
                        />
                    </div>
                    <div className="git-not-repo">Not a git repository</div>
                </div>
                <div className="git-diff-panel">
                    <div className="git-diff-empty">Open a git repository to view changes</div>
                </div>
            </div>
        );
    }

    const hasStaged = (status.staged?.length ?? 0) > 0;
    const stagedFiles = filterFiles(status.staged ?? []);
    const unstagedFiles = filterFiles(status.unstaged ?? []);
    const untrackedFiles = filterFiles(status.untracked ?? []);

    return (
        <div className="git-view-container">
            <div className="git-sidebar">
                <div className="git-path-bar">
                    <input
                        className="git-path-input"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={handlePathSubmit}
                        placeholder="Repository path..."
                        spellCheck={false}
                    />
                    <button className="git-browse-btn" onClick={handleBrowse} title="Browse for repository...">
                        …
                    </button>
                </div>

                <div className="git-filter-bar">
                    <input
                        className="git-filter-input"
                        value={fileFilter}
                        onChange={(e) => setFileFilter(e.target.value)}
                        placeholder="Filter files..."
                        spellCheck={false}
                    />
                    {fileFilter && (
                        <button
                            className="git-filter-clear"
                            onClick={() => setFileFilter("")}
                            title="Clear filter"
                        >
                            ⨯
                        </button>
                    )}
                </div>

                {stagedFiles.length > 0 && (
                    <div className="git-section">
                        <div className="git-section-header">Staged Changes ({stagedFiles.length})</div>
                        {stagedFiles.map((f) => (
                            <FileRow key={"s:" + f.path} file={f} staged={true} model={model} />
                        ))}
                    </div>
                )}

                {unstagedFiles.length > 0 && (
                    <div className="git-section">
                        <div className="git-section-header">
                            Changes ({unstagedFiles.length})
                            <button className="git-action-btn" title="Stage All" onClick={() => model.stageAll()}>
                                Stage All
                            </button>
                        </div>
                        {unstagedFiles.map((f) => (
                            <FileRow key={"u:" + f.path} file={f} staged={false} model={model} />
                        ))}
                    </div>
                )}

                {untrackedFiles.length > 0 && (
                    <div className="git-section">
                        <div className="git-section-header">Untracked ({untrackedFiles.length})</div>
                        {untrackedFiles.map((f) => (
                            <FileRow key={"n:" + f.path} file={f} staged={false} model={model} />
                        ))}
                    </div>
                )}

                {stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0 && !fileFilter && (
                    <div className="git-clean">Working tree clean</div>
                )}
                {stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0 && fileFilter && (
                    <div className="git-filter-empty">No files match "{fileFilter}"</div>
                )}

                <div className="git-commit-box">
                    <textarea
                        className="git-commit-input"
                        placeholder="Commit message..."
                        value={commitMsg}
                        onChange={(e) => setCommitMsg(e.target.value)}
                    />
                    <button
                        className="git-commit-btn"
                        disabled={!hasStaged || !commitMsg.trim()}
                        onClick={() => model.commit()}
                    >
                        Commit
                    </button>
                </div>
            </div>

            <div className="git-diff-panel">
                {selected ? (
                    <div className="git-diff-content">
                        {diffText.split("\n").map((line, i) => (
                            <DiffLine key={i} line={line} />
                        ))}
                    </div>
                ) : (
                    <div className="git-diff-empty">Select a file to view its diff</div>
                )}
            </div>
        </div>
    );
}

export default GitView;