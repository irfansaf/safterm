// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wshrpc/wshclient"
)

var gitMagnified bool

var gitCmd = &cobra.Command{
	Use:     "git [directory]",
	Short:   "open the git status/diff/stage widget for a directory",
	RunE:    gitRun,
	PreRunE: preRunSetupRpcClient,
}

func init() {
	gitCmd.Flags().BoolVarP(&gitMagnified, "magnified", "m", false, "open view in magnified mode")
	rootCmd.AddCommand(gitCmd)
}

func gitRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("git", rtnErr == nil)
	}()

	dirArg := "."
	if len(args) == 1 {
		dirArg = args[0]
	} else if len(args) > 1 {
		OutputHelpMessage(cmd)
		return fmt.Errorf("too many arguments. wsh git requires zero or one argument")
	}

	tabId := getTabIdFromEnv()
	if tabId == "" {
		return fmt.Errorf("no WAVETERM_TABID env var set")
	}

	absDir, err := filepath.Abs(dirArg)
	if err != nil {
		return fmt.Errorf("getting absolute path: %w", err)
	}
	if info, err := os.Stat(absDir); err != nil || !info.IsDir() {
		return fmt.Errorf("not a directory: %q", absDir)
	}

	wshCmd := &wshrpc.CommandCreateBlockData{
		TabId: tabId,
		BlockDef: &waveobj.BlockDef{
			Meta: map[string]interface{}{
				waveobj.MetaKey_View: "git",
				"git:dir":            absDir,
			},
		},
		Magnified: gitMagnified,
		Focused:   true,
	}

	_, err = wshclient.CreateBlockCommand(RpcClient, *wshCmd, &wshrpc.RpcOpts{Timeout: 2000})
	if err != nil {
		return fmt.Errorf("running git command: %w", err)
	}
	return nil
}