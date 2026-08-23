// Copyright 2026, Irfan Saf
// SPDX-License-Identifier: Apache-2.0

package wshserver

// implementation of pi-mesh agent panel commands
// shells out to `pi-mesh-cli` (status/submit-task) and `pi-mesh-hub` (auto-start),
// and spawns worker agents as regular SafTerm terminal blocks — no new
// dependency on grpc inside safterm itself.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/wavetermdev/waveterm/pkg/util/utilfn"
	"github.com/wavetermdev/waveterm/pkg/wavebase"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

const meshWorkerSkillsPlaceholder = "__SKILLS__"

func meshDirs(dir string) (meshDir, socketPath, dbPath string, err error) {
	absDir, err := wavebase.ExpandHomeDir(dir)
	if err != nil {
		return "", "", "", fmt.Errorf("resolving dir: %w", err)
	}
	meshDir = filepath.Join(absDir, ".pi-mesh")
	socketPath = filepath.Join(meshDir, "hub.sock")
	dbPath = filepath.Join(meshDir, "queue.db")
	return meshDir, socketPath, dbPath, nil
}

func (ws *WshServer) MeshStatusCommand(ctx context.Context, data wshrpc.CommandMeshStatusData) (*wshrpc.MeshStatusData, error) {
	_, socketPath, dbPath, err := meshDirs(data.Dir)
	if err != nil {
		return nil, err
	}

	if _, statErr := os.Stat(socketPath); statErr != nil {
		return &wshrpc.MeshStatusData{Running: false}, nil
	}

	out, err := exec.CommandContext(ctx, "pi-mesh-cli", "status", "--socket", socketPath, "--db", dbPath).Output()
	if err != nil {
		return nil, fmt.Errorf("pi-mesh-cli status: %w", err)
	}

	var cliOut struct {
		Running  bool `json:"running"`
		Agents   []struct {
			AgentId      string   `json:"agent_id"`
			Role         string   `json:"role"`
			Status       string   `json:"status"`
			Capabilities []string `json:"capabilities"`
		} `json:"agents"`
		Pending      int    `json:"pending"`
		Claimed      int    `json:"claimed"`
		RunningTasks int    `json:"running_tasks"`
		Completed    int    `json:"completed"`
		Failed       int    `json:"failed"`
		Error        string `json:"error,omitempty"`
	}
	if err := json.Unmarshal(out, &cliOut); err != nil {
		return nil, fmt.Errorf("parsing pi-mesh-cli output: %w", err)
	}

	result := &wshrpc.MeshStatusData{
		Running:      cliOut.Running,
		Pending:      cliOut.Pending,
		Claimed:      cliOut.Claimed,
		RunningTasks: cliOut.RunningTasks,
		Completed:    cliOut.Completed,
		Failed:       cliOut.Failed,
		Error:        cliOut.Error,
	}
	for _, a := range cliOut.Agents {
		result.Agents = append(result.Agents, wshrpc.MeshAgentEntry{
			AgentId:      a.AgentId,
			Role:         a.Role,
			Status:       a.Status,
			Capabilities: a.Capabilities,
		})
	}
	return result, nil
}

// ensureHubRunning starts pi-mesh-hub for the given project dir if it isn't
// already listening, and waits (briefly) for the socket to appear.
func ensureHubRunning(dir, socketPath string) error {
	if _, err := os.Stat(socketPath); err == nil {
		return nil // already running
	}

	logPath := filepath.Join(filepath.Dir(socketPath), "hub.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		logFile = nil // best-effort logging only
	}

	cmd := exec.Command("pi-mesh-hub", "--project")
	cmd.Dir = dir
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}
	// Detach so it survives after wavesrv's own child-process management
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting pi-mesh-hub: %w", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(socketPath); err == nil {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("hub did not start within 5s (check %s)", logPath)
}

func findMeshPython() string {
	candidates := []string{
		os.ExpandEnv("$HOME/.venv/bin/python"),
		os.ExpandEnv("$HOME/.venv/bin/python3"),
		"python3",
		"python",
	}
	for _, py := range candidates {
		cmd := exec.Command(py, "-c", "import grpc")
		if err := cmd.Run(); err == nil {
			return py
		}
	}
	return "python3"
}

// findPiMeshSDKPath locates the pi_mesh Python package directory.
// Checks the common dev location first, falls back to env override.
func findPiMeshSDKPath() string {
	if envPath := os.Getenv("PI_MESH_PKG_PATH"); envPath != "" {
		return envPath
	}
	return os.ExpandEnv("$HOME/Project/pi-mesh/pkg")
}

func (ws *WshServer) MeshSpawnWorkerCommand(ctx context.Context, data wshrpc.CommandMeshSpawnWorkerData) (waveobj.ORef, error) {
	meshDir, socketPath, _, err := meshDirs(data.Dir)
	if err != nil {
		return waveobj.ORef{}, err
	}
	if err := os.MkdirAll(meshDir, 0755); err != nil {
		return waveobj.ORef{}, fmt.Errorf("creating mesh dir: %w", err)
	}

	// ponytail: delete stale worker scripts so SafTerm tab restore
	// doesn't replay old sessions on next launch.
	staleFiles, _ := filepath.Glob(filepath.Join(meshDir, "_worker_*.py"))
	for _, f := range staleFiles {
		os.Remove(f)
	}

	if err := ensureHubRunning(filepath.Dir(meshDir), socketPath); err != nil {
		return waveobj.ORef{}, err
	}

	pythonBin := findMeshPython()
	sdkPath := findPiMeshSDKPath()
	skillsArg := strings.Join(data.Skills, ",")

	workerScript := fmt.Sprintf(`import sys, logging
logging.basicConfig(level=logging.INFO, format='%%(asctime)s [%%(name)s] %%(message)s')
sys.path.insert(0, %q)
from pi_mesh import Agent, Role, Task
import asyncio
agent = Agent(role=Role.WORKER, capabilities=[%q])
@agent.on_task('')
async def _handle(task: Task):
    print(f'[worker] Got: {task.prompt[:60]}...')
    return {'status': 'ok', 'worker': agent.agent_id}
async def _run():
    await agent.connect()
    await agent.wait()
asyncio.run(_run())
`, sdkPath, skillsArg)

	scriptPath := filepath.Join(meshDir, fmt.Sprintf("_worker_%d.py", time.Now().UnixNano()))
	if err := os.WriteFile(scriptPath, []byte(workerScript), 0644); err != nil {
		return waveobj.ORef{}, fmt.Errorf("writing worker script: %w", err)
	}

	// cmd:shell defaults to true in SafTerm's controller, which runs cmd
	// as shell syntax and ignores cmd:args entirely. Build a single
	// shell-quoted command string instead of relying on cmd:args.
	fullCmd := fmt.Sprintf("%s %s", utilfn.ShellQuote(pythonBin, false, -1), utilfn.ShellQuote(scriptPath, false, -1))

	wshCmd := wshrpc.CommandCreateBlockData{
		TabId: data.TabId,
		BlockDef: &waveobj.BlockDef{
			Meta: map[string]interface{}{
				waveobj.MetaKey_View:       "term",
				waveobj.MetaKey_Controller: "cmd",
				"cmd":                      fullCmd,
				"cmd:cwd":                  data.Dir,
			},
		},
		Focused: false,
	}

	oref, err := ws.CreateBlockCommand(ctx, wshCmd)
	if err != nil {
		return waveobj.ORef{}, fmt.Errorf("creating worker block: %w", err)
	}
	return *oref, nil
}

func (ws *WshServer) MeshSubmitTaskCommand(ctx context.Context, data wshrpc.CommandMeshSubmitTaskData) (*wshrpc.MeshSubmitTaskRtnData, error) {
	if data.Skill == "" || data.Prompt == "" {
		return nil, fmt.Errorf("skill and prompt are required")
	}

	_, socketPath, _, err := meshDirs(data.Dir)
	if err != nil {
		return nil, err
	}
	if _, statErr := os.Stat(socketPath); statErr != nil {
		return nil, fmt.Errorf("hub is not running for this directory")
	}

	args := []string{
		"submit-task",
		"--socket", socketPath,
		"--skill", data.Skill,
		"--prompt", data.Prompt,
	}
	if data.FanOut {
		args = append(args, "--fanout")
	}
	if data.MaxWorkers > 0 {
		args = append(args, "--max-workers", fmt.Sprintf("%d", data.MaxWorkers))
	}

	out, err := exec.CommandContext(ctx, "pi-mesh-cli", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("pi-mesh-cli submit-task: %w", err)
	}

	var cliOut struct {
		TaskId     string   `json:"task_id"`
		SubTaskIds []string `json:"sub_task_ids"`
	}
	if err := json.Unmarshal(out, &cliOut); err != nil {
		return nil, fmt.Errorf("parsing pi-mesh-cli output: %w", err)
	}

	return &wshrpc.MeshSubmitTaskRtnData{
		TaskId:     cliOut.TaskId,
		SubTaskIds: cliOut.SubTaskIds,
	}, nil
}