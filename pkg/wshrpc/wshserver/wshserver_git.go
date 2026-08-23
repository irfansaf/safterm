// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

// implementation of git commands (pi-mesh addition)
// shells out to the system `git` binary — no new dependency, works with
// whatever git config/credentials/hooks the user already has set up.

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

// runGit executes git in the given directory and returns stdout.
// Returns a descriptive error including stderr on failure.
func runGit(dir string, args ...string) (string, error) {
	if dir == "" {
		return "", fmt.Errorf("dir is required")
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("resolving dir: %w", err)
	}
	cmd := exec.Command("git", args...)
	cmd.Dir = absDir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func (ws *WshServer) GitStatusCommand(ctx context.Context, data wshrpc.CommandGitStatusData) (*wshrpc.GitStatusData, error) {
	// Check if it's a repo at all
	if _, err := runGit(data.Dir, "rev-parse", "--is-inside-work-tree"); err != nil {
		return &wshrpc.GitStatusData{IsRepo: false}, nil
	}

	branchOut, err := runGit(data.Dir, "branch", "--show-current")
	if err != nil {
		return nil, fmt.Errorf("getting branch: %w", err)
	}
	branch := strings.TrimSpace(branchOut)
	if branch == "" {
		branch = "(detached HEAD)"
	}

	statusOut, err := runGit(data.Dir, "status", "--porcelain=v1", "-z")
	if err != nil {
		return nil, fmt.Errorf("getting status: %w", err)
	}

	result := &wshrpc.GitStatusData{
		Branch: branch,
		IsRepo: true,
	}

	// porcelain v1 -z: each entry is "XY path\0" (rename entries have two paths)
	entries := strings.Split(statusOut, "\x00")
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if len(entry) < 3 {
			continue
		}
		indexStatus := entry[0]
		worktreeStatus := entry[1]
		path := entry[3:]

		if indexStatus == 'R' || indexStatus == 'C' {
			// rename/copy: next entry is the "from" path, skip it
			i++
		}

		if indexStatus == '?' && worktreeStatus == '?' {
			result.Untracked = append(result.Untracked, wshrpc.GitFileEntry{Path: path, Status: "??"})
			continue
		}
		if indexStatus != ' ' && indexStatus != '?' {
			result.Staged = append(result.Staged, wshrpc.GitFileEntry{Path: path, Status: string(indexStatus)})
		}
		if worktreeStatus != ' ' && worktreeStatus != '?' {
			result.Unstaged = append(result.Unstaged, wshrpc.GitFileEntry{Path: path, Status: string(worktreeStatus)})
		}
	}

	// ahead/behind vs upstream (best-effort, ignore errors — no upstream is common)
	aheadBehind, err := runGit(data.Dir, "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
	if err == nil {
		parts := strings.Fields(strings.TrimSpace(aheadBehind))
		if len(parts) == 2 {
			result.Ahead, _ = strconv.Atoi(parts[0])
			result.Behind, _ = strconv.Atoi(parts[1])
		}
	}

	return result, nil
}

func (ws *WshServer) GitDiffCommand(ctx context.Context, data wshrpc.CommandGitDiffData) (string, error) {
	args := []string{"diff", "--no-color"}
	if data.Staged {
		args = append(args, "--cached")
	}
	if data.File != "" {
		args = append(args, "--", data.File)
	}
	return runGit(data.Dir, args...)
}

func (ws *WshServer) GitStageCommand(ctx context.Context, data wshrpc.CommandGitFileData) error {
	if data.File == "" {
		return fmt.Errorf("file is required")
	}
	_, err := runGit(data.Dir, "add", "--", data.File)
	return err
}

func (ws *WshServer) GitUnstageCommand(ctx context.Context, data wshrpc.CommandGitFileData) error {
	if data.File == "" {
		return fmt.Errorf("file is required")
	}
	_, err := runGit(data.Dir, "restore", "--staged", "--", data.File)
	return err
}

func (ws *WshServer) GitStageAllCommand(ctx context.Context, data wshrpc.CommandGitStatusData) error {
	_, err := runGit(data.Dir, "add", "-A")
	return err
}

func (ws *WshServer) GitCommitCommand(ctx context.Context, data wshrpc.CommandGitCommitData) error {
	if strings.TrimSpace(data.Message) == "" {
		return fmt.Errorf("commit message is required")
	}
	_, err := runGit(data.Dir, "commit", "-m", data.Message)
	return err
}

func (ws *WshServer) GitDiscardCommand(ctx context.Context, data wshrpc.CommandGitFileData) error {
	if data.File == "" {
		return fmt.Errorf("file is required")
	}
	// Unstage first (ignore error — file may not be staged), then discard working tree changes
	runGit(data.Dir, "restore", "--staged", "--", data.File)
	_, err := runGit(data.Dir, "checkout", "--", data.File)
	return err
}