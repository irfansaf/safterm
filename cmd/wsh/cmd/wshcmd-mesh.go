// Copyright 2026, Irfan Saf
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

var meshMagnified bool

var meshCmd = &cobra.Command{
	Use:     "mesh [directory]",
	Short:   "open the pi-mesh agent panel for a directory",
	RunE:    meshRun,
	PreRunE: preRunSetupRpcClient,
}

func init() {
	meshCmd.Flags().BoolVarP(&meshMagnified, "magnified", "m", false, "open view in magnified mode")
	rootCmd.AddCommand(meshCmd)
}

func meshRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("mesh", rtnErr == nil)
	}()

	dirArg := "."
	if len(args) == 1 {
		dirArg = args[0]
	} else if len(args) > 1 {
		OutputHelpMessage(cmd)
		return fmt.Errorf("too many arguments. wsh mesh requires zero or one argument")
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
				waveobj.MetaKey_View: "mesh",
				"mesh:dir":           absDir,
			},
		},
		Magnified: meshMagnified,
		Focused:   true,
	}

	_, err = wshclient.CreateBlockCommand(RpcClient, *wshCmd, &wshrpc.RpcOpts{Timeout: 2000})
	if err != nil {
		return fmt.Errorf("running mesh command: %w", err)
	}
	return nil
}