// Copyright 2026, Irfan Saf
// SPDX-License-Identifier: Apache-2.0

import type { BlockNodeModel } from "@/app/block/blocktypes";
import type { TabModel } from "@/app/store/tab-model";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { WaveEnv, WaveEnvSubset } from "@/app/waveenv/waveenv";
import { globalStore } from "@/store/jotaiStore";
import * as jotai from "jotai";
import { useEffect, useRef } from "react";
import "./mesh.scss";

export type MeshViewEnv = WaveEnvSubset<{
    rpc: {
        MeshStatusCommand: WaveEnv["rpc"]["MeshStatusCommand"];
        MeshSpawnWorkerCommand: WaveEnv["rpc"]["MeshSpawnWorkerCommand"];
        MeshSubmitTaskCommand: WaveEnv["rpc"]["MeshSubmitTaskCommand"];
    };
    wos: WaveEnv["wos"];
}>;

const POLL_INTERVAL_MS = 2000;

export class MeshViewModel implements ViewModel {
    blockId: string;
    nodeModel: BlockNodeModel;
    tabModel: TabModel;
    env: MeshViewEnv;
    viewType = "mesh";
    blockAtom: jotai.Atom<Block>;
    dirAtom: jotai.Atom<string>;
    statusAtom: jotai.PrimitiveAtom<MeshStatusData | null>;
    errorAtom: jotai.PrimitiveAtom<string | null>;
    submitSkillAtom: jotai.PrimitiveAtom<string>;
    submitPromptAtom: jotai.PrimitiveAtom<string>;
    submitFanOutAtom: jotai.PrimitiveAtom<boolean>;
    spawningAtom: jotai.PrimitiveAtom<boolean>;
    viewIcon: jotai.Atom<string>;
    viewName: jotai.Atom<string>;
    viewText: jotai.Atom<HeaderElem[]>;
    noPadding = jotai.atom<boolean>(true);
    private pollHandle: ReturnType<typeof setInterval> | null = null;

    constructor({ blockId, nodeModel, tabModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.tabModel = tabModel;
        this.env = waveEnv as MeshViewEnv;
        this.blockAtom = this.env.wos.getWaveObjectAtom<Block>(`block:${blockId}`);
        this.dirAtom = jotai.atom((get) => {
            const blockData = get(this.blockAtom);
            return (blockData?.meta?.["mesh:dir"] as string) || "~";
        });
        this.statusAtom = jotai.atom(null) as jotai.PrimitiveAtom<MeshStatusData | null>;
        this.errorAtom = jotai.atom(null) as jotai.PrimitiveAtom<string | null>;
        this.submitSkillAtom = jotai.atom("code:python");
        this.submitPromptAtom = jotai.atom("");
        this.submitFanOutAtom = jotai.atom(false);
        this.spawningAtom = jotai.atom(false);
        this.viewIcon = jotai.atom("network-wired");
        this.viewName = jotai.atom("Agent Mesh");
        this.viewText = jotai.atom((get) => {
            const status = get(this.statusAtom);
            const rtn: HeaderElem[] = [];
            if (status) {
                rtn.push({
                    elemtype: "text",
                    text: status.running ? `${status.agents?.length ?? 0} agents` : "hub offline",
                });
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
        return MeshView;
    }

    startPolling() {
        this.refresh();
        this.pollHandle = setInterval(() => this.refresh(), POLL_INTERVAL_MS);
    }

    dispose() {
        if (this.pollHandle) {
            clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
    }

    async refresh() {
        const dir = globalStore.get(this.dirAtom);
        try {
            const status = await this.env.rpc.MeshStatusCommand(TabRpcClient, { dir });
            globalStore.set(this.statusAtom, status);
            globalStore.set(this.errorAtom, null);
        } catch (e) {
            globalStore.set(this.errorAtom, `${e.message}`);
        }
    }

    async spawnWorker(skills: string[]) {
        const dir = globalStore.get(this.dirAtom);
        globalStore.set(this.spawningAtom, true);
        try {
            await this.env.rpc.MeshSpawnWorkerCommand(TabRpcClient, {
                dir,
                tabid: this.tabModel.tabId,
                skills,
            });
            // Give the worker a moment to register before refreshing
            setTimeout(() => this.refresh(), 1500);
        } catch (e) {
            globalStore.set(this.errorAtom, `${e.message}`);
        } finally {
            globalStore.set(this.spawningAtom, false);
        }
    }

    async submitTask() {
        const dir = globalStore.get(this.dirAtom);
        const skill = globalStore.get(this.submitSkillAtom);
        const prompt = globalStore.get(this.submitPromptAtom);
        const fanOut = globalStore.get(this.submitFanOutAtom);
        if (!skill.trim() || !prompt.trim()) {
            return;
        }
        try {
            await this.env.rpc.MeshSubmitTaskCommand(TabRpcClient, {
                dir,
                skill,
                prompt,
                fanout: fanOut,
                maxworkers: 0,
            });
            globalStore.set(this.submitPromptAtom, "");
            setTimeout(() => this.refresh(), 500);
        } catch (e) {
            globalStore.set(this.errorAtom, `${e.message}`);
        }
    }
}

function roleBadgeClass(role: string): string {
    switch (role) {
        case "ORCHESTRATOR":
            return "mesh-role-orchestrator";
        case "WORKER":
            return "mesh-role-worker";
        case "REVIEWER":
            return "mesh-role-reviewer";
        default:
            return "mesh-role-observer";
    }
}

function statusDotClass(status: string): string {
    switch (status) {
        case "IDLE":
            return "mesh-status-idle";
        case "BUSY":
            return "mesh-status-busy";
        case "OFFLINE":
        case "ERROR":
            return "mesh-status-error";
        default:
            return "mesh-status-idle";
    }
}

function AgentRow({ agent }: { agent: MeshAgentEntry }) {
    return (
        <div className="mesh-agent-row">
            <span className={`mesh-status-dot ${statusDotClass(agent.status)}`} title={agent.status} />
            <span className={`mesh-role-badge ${roleBadgeClass(agent.role)}`}>{agent.role}</span>
            <span className="mesh-agent-id">{agent.agentid}</span>
            <span className="mesh-agent-skills">{agent.capabilities?.join(", ")}</span>
        </div>
    );
}

function StatChip({ label, value, className }: { label: string; value: number; className?: string }) {
    return (
        <div className={`mesh-stat-chip ${className ?? ""}`}>
            <div className="mesh-stat-value">{value}</div>
            <div className="mesh-stat-label">{label}</div>
        </div>
    );
}

function MeshView({ model }: ViewComponentProps<MeshViewModel>) {
    const status = jotai.useAtomValue(model.statusAtom);
    const error = jotai.useAtomValue(model.errorAtom);
    const spawning = jotai.useAtomValue(model.spawningAtom);
    const [skill, setSkill] = jotai.useAtom(model.submitSkillAtom);
    const [prompt, setPrompt] = jotai.useAtom(model.submitPromptAtom);
    const [fanOut, setFanOut] = jotai.useAtom(model.submitFanOutAtom);
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        model.startPolling();
        return () => model.dispose();
    }, []);

    return (
        <div className="mesh-view-container">
            {error && <div className="mesh-error">{error}</div>}

            {!status ? (
                <div className="mesh-loading">Loading...</div>
            ) : !status.running ? (
                <div className="mesh-offline">
                    <div className="mesh-offline-text">Hub is not running for this directory</div>
                    <button
                        className="mesh-spawn-btn"
                        disabled={spawning}
                        onClick={() => model.spawnWorker(["code:python"])}
                    >
                        Start Hub &amp; Spawn Worker
                    </button>
                </div>
            ) : (
                <>
                    <div className="mesh-stats-row">
                        <StatChip label="pending" value={status.pending} />
                        <StatChip label="claimed" value={status.claimed} />
                        <StatChip label="running" value={status.runningtasks} />
                        <StatChip label="done" value={status.completed} className="mesh-stat-success" />
                        <StatChip label="failed" value={status.failed} className="mesh-stat-danger" />
                    </div>

                    <div className="mesh-section">
                        <div className="mesh-section-header">
                            Agents ({status.agents?.length ?? 0})
                            <button
                                className="mesh-action-btn"
                                disabled={spawning}
                                onClick={() => model.spawnWorker(["code:python"])}
                            >
                                {spawning ? "Spawning..." : "+ Spawn Worker"}
                            </button>
                        </div>
                        {status.agents?.length ? (
                            status.agents.map((a) => <AgentRow key={a.agentid} agent={a} />)
                        ) : (
                            <div className="mesh-empty">No agents connected</div>
                        )}
                    </div>

                    <div className="mesh-section mesh-submit-box">
                        <div className="mesh-section-header">Submit Task</div>
                        <input
                            className="mesh-input"
                            placeholder="skill (e.g. code:python)"
                            value={skill}
                            onChange={(e) => setSkill(e.target.value)}
                        />
                        <textarea
                            className="mesh-textarea"
                            placeholder="prompt..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                        <label className="mesh-checkbox-label">
                            <input type="checkbox" checked={fanOut} onChange={(e) => setFanOut(e.target.checked)} />
                            Fan out to all idle workers
                        </label>
                        <button
                            className="mesh-submit-btn"
                            disabled={!skill.trim() || !prompt.trim()}
                            onClick={() => model.submitTask()}
                        >
                            Submit
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default MeshView;