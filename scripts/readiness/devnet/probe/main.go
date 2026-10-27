// Command probe exercises gouroboros against a Dijkstra devnet node the way its consumers do.
//
//	probe handshake SOCKET     dial node-to-client and read the mempool sizes (txtop, cardano-node-api)
//	probe mempool SOCKET SECS  print every new mempool transaction as hex for SECS seconds
//	probe decode < LINES       "name hex" per line: era detection and decode, plus a forced Dijkstra decode
//	probe chain SOCKET         chain-sync from origin to the tip and tally decoding per era
//	probe first-blocks SOCKET  print the first raw block of each era as "type hex"
//	probe blocks SOCKET        print every raw Dijkstra block up to the tip as "type hex" (for codecs without a node client)
package main

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	ouroboros "github.com/blinklabs-io/gouroboros"
	"github.com/blinklabs-io/gouroboros/ledger"
	"github.com/blinklabs-io/gouroboros/protocol/chainsync"
	pcommon "github.com/blinklabs-io/gouroboros/protocol/common"
)

const magic = 42

func dial(socket string, options ...ouroboros.ConnectionOptionFunc) (*ouroboros.Connection, chan error) {
	errs := make(chan error, 10)
	options = append([]ouroboros.ConnectionOptionFunc{
		ouroboros.WithNetworkMagic(magic),
		ouroboros.WithErrorChan(errs),
		ouroboros.WithNodeToNode(false),
		ouroboros.WithKeepAlive(true),
	}, options...)
	conn, err := ouroboros.NewConnection(options...)
	if err != nil {
		fail("new connection: %v", err)
	}
	if err := conn.Dial("unix", socket); err != nil {
		fail("dial: %v", err)
	}
	return conn, errs
}

func fail(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
	os.Exit(1)
}

func handshake(socket string) {
	conn, _ := dial(socket)
	capacity, size, count, err := conn.LocalTxMonitor().Client.GetSizes()
	if err != nil {
		fail("mempool sizes: %v", err)
	}
	fmt.Printf("handshake ok; mempool capacity %d size %d transactions %d\n", capacity, size, count)
}

// mempool mirrors txtop's refresh loop: NextTx until the snapshot is exhausted, then release and poll again.
func mempool(socket string, seconds int) {
	conn, _ := dial(socket)
	seen := map[string]bool{}
	for deadline := time.Now().Add(time.Duration(seconds) * time.Second); time.Now().Before(deadline); {
		client := conn.LocalTxMonitor().Client
		for {
			raw, err := client.NextTx()
			if err != nil {
				fail("NextTx: %v", err)
			}
			if raw == nil {
				break
			}
			if h := hex.EncodeToString(raw); !seen[h] {
				seen[h] = true
				fmt.Println(h)
			}
		}
		_ = client.Release()
		time.Sleep(200 * time.Millisecond)
	}
}

// decodeOne is what txtop, bursa, adder's mempool input and tx-submit-api do with raw transaction bytes.
func decodeOne(raw []byte) string {
	txType, err := ledger.DetermineTransactionType(raw)
	if err != nil {
		forced := "ok"
		if _, err := ledger.NewTransactionFromCbor(ledger.TxTypeDijkstra, raw); err != nil {
			forced = err.Error()
		}
		return fmt.Sprintf("head %x: DetermineTransactionType: %v; forced Dijkstra decode: %s", raw[:2], err, forced)
	}
	if _, err := ledger.NewTransactionFromCbor(txType, raw); err != nil {
		return fmt.Sprintf("head %x: type %d: decode: %v", raw[:2], txType, err)
	}
	return fmt.Sprintf("head %x: type %d: decoded", raw[:2], txType)
}

func decode() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1<<20), 1<<24)
	for scanner.Scan() {
		name, h, _ := strings.Cut(scanner.Text(), " ")
		raw, err := hex.DecodeString(h)
		if err != nil {
			fail("%s: %v", name, err)
		}
		fmt.Printf("%-30s %s\n", name, decodeOne(raw))
	}
}

func chain(socket string) {
	var mu sync.Mutex
	counts := map[string]int{}
	bump := func(k string) { mu.Lock(); counts[k]++; mu.Unlock() }
	var tipSlot uint64
	done := make(chan struct{})
	var once sync.Once
	cfg := chainsync.NewConfig(
		chainsync.WithRollBackwardFunc(func(chainsync.CallbackContext, pcommon.Point, chainsync.Tip) error { return nil }),
		chainsync.WithRollForwardFunc(func(_ chainsync.CallbackContext, _ uint, data any, _ chainsync.Tip) error {
			block, ok := data.(ledger.Block)
			if !ok {
				bump(fmt.Sprintf("not a block: %T", data))
				return nil
			}
			era := block.Era().Name
			bump(era + ": block decoded")
			for _, tx := range block.Transactions() {
				bump(era + ": transaction " + strings.SplitN(decodeOne(tx.Cbor()), ": ", 2)[1])
			}
			if block.SlotNumber() >= tipSlot {
				once.Do(func() { close(done) })
			}
			return nil
		}),
	)
	conn, errs := dial(socket, ouroboros.WithChainSyncConfig(cfg))
	tip, err := conn.ChainSync().Client.GetCurrentTip()
	if err != nil {
		fail("tip: %v", err)
	}
	tipSlot = tip.Point.Slot
	fmt.Println("tip slot", tipSlot)
	if err := conn.ChainSync().Client.Sync([]pcommon.Point{pcommon.NewPointOrigin()}); err != nil {
		fail("sync: %v", err)
	}
	select {
	case <-done:
	case err := <-errs:
		fmt.Println("connection error:", err)
	case <-time.After(5 * time.Minute):
		fmt.Println("timeout")
	}
	mu.Lock()
	defer mu.Unlock()
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Printf("%6d  %s\n", counts[k], k)
	}
}

func firstBlocks(socket string) {
	var mu sync.Mutex
	seen := map[uint]bool{}
	done := make(chan struct{})
	var once sync.Once
	cfg := chainsync.NewConfig(
		chainsync.WithRollBackwardFunc(func(chainsync.CallbackContext, pcommon.Point, chainsync.Tip) error { return nil }),
		chainsync.WithRollForwardRawFunc(func(_ chainsync.CallbackContext, blockType uint, raw []byte, _ chainsync.Tip) error {
			mu.Lock()
			defer mu.Unlock()
			if !seen[blockType] {
				seen[blockType] = true
				fmt.Printf("%d %s\n", blockType, hex.EncodeToString(raw))
			}
			if blockType >= ledger.BlockTypeDijkstra {
				once.Do(func() { close(done) })
			}
			return nil
		}),
	)
	conn, errs := dial(socket, ouroboros.WithChainSyncConfig(cfg))
	if err := conn.ChainSync().Client.Sync([]pcommon.Point{pcommon.NewPointOrigin()}); err != nil {
		fail("sync: %v", err)
	}
	select {
	case <-done:
	case err := <-errs:
		fail("connection error: %v", err)
	case <-time.After(2 * time.Minute):
		fail("timeout")
	}
}

// dijkstraBlocks syncs from origin and prints every Dijkstra block; it stops once no block has arrived for 3 seconds,
// which on the devnet means the tip was reached.
func dijkstraBlocks(socket string) {
	var mu sync.Mutex
	last := time.Now()
	cfg := chainsync.NewConfig(
		chainsync.WithRollBackwardFunc(func(chainsync.CallbackContext, pcommon.Point, chainsync.Tip) error { return nil }),
		chainsync.WithRollForwardRawFunc(func(_ chainsync.CallbackContext, blockType uint, raw []byte, _ chainsync.Tip) error {
			mu.Lock()
			defer mu.Unlock()
			last = time.Now()
			if blockType >= ledger.BlockTypeDijkstra {
				fmt.Printf("%d %s\n", blockType, hex.EncodeToString(raw))
			}
			return nil
		}),
	)
	conn, errs := dial(socket, ouroboros.WithChainSyncConfig(cfg))
	if err := conn.ChainSync().Client.Sync([]pcommon.Point{pcommon.NewPointOrigin()}); err != nil {
		fail("sync: %v", err)
	}
	for {
		select {
		case err := <-errs:
			fail("connection error: %v", err)
		case <-time.After(500 * time.Millisecond):
			mu.Lock()
			idle := time.Since(last)
			mu.Unlock()
			if idle > 3*time.Second {
				return
			}
		}
	}
}

func main() {
	if len(os.Args) < 2 {
		fail("usage: probe handshake|mempool|decode|chain|first-blocks|blocks ...")
	}
	switch os.Args[1] {
	case "handshake":
		handshake(os.Args[2])
	case "mempool":
		seconds, err := strconv.Atoi(os.Args[3])
		if err != nil {
			fail("seconds: %v", err)
		}
		mempool(os.Args[2], seconds)
	case "decode":
		decode()
	case "chain":
		chain(os.Args[2])
	case "first-blocks":
		firstBlocks(os.Args[2])
	case "blocks":
		dijkstraBlocks(os.Args[2])
	default:
		fail("unknown command %s", os.Args[1])
	}
}
