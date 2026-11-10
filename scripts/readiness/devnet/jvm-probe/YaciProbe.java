// Decode raw Dijkstra blocks with Yaci's BlockSerializer, which yaci-store and other Yaci chain followers use.
// Lines come from `probe-<version> blocks` ("<era tag> <unwrapped block hex>"); each block is wrapped as the
// hard-fork combinator does, [era, block], before decoding, because that is what BlockSerializer reads.
//
//   java -cp CLASSPATH YaciProbe < blocks.txt
import com.bloxbean.cardano.yaci.core.model.Block;
import com.bloxbean.cardano.yaci.core.model.serializers.BlockSerializer;
import com.bloxbean.cardano.yaci.core.util.HexUtil;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Map;
import java.util.TreeMap;

public class YaciProbe {
    public static void main(String[] args) throws Exception {
        System.out.println("yaci " + (args.length > 0 ? args[0] : "unknown"));
        Map<String, Integer> tally = new TreeMap<>();
        String firstFailure = null;
        int blocks = 0, txs = 0;
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        for (String line; (line = in.readLine()) != null; ) {
            String[] parts = line.trim().split(" ");
            if (parts.length < 2) continue;
            int era = Integer.parseInt(parts[0]);
            byte[] raw = HexUtil.decodeHexString(parts[1]);
            byte[] wrapped = new byte[raw.length + 2];
            wrapped[0] = (byte) 0x82;
            wrapped[1] = (byte) era; // era tags are below 24, so one byte
            System.arraycopy(raw, 0, wrapped, 2, raw.length);
            blocks++;
            String outcome;
            try {
                Block block = BlockSerializer.INSTANCE.deserialize(wrapped);
                int n = block.getTransactionBodies() == null ? 0 : block.getTransactionBodies().size();
                txs += n;
                outcome = "era " + block.getEra() + ": block decoded";
            } catch (Throwable e) {
                outcome = "era tag " + era + ": failed";
                if (firstFailure == null) firstFailure = shortMessage(e);
            }
            tally.merge(outcome, 1, Integer::sum);
        }
        System.out.println(blocks + " blocks, " + txs + " transaction bodies in decoded blocks");
        tally.forEach((k, v) -> System.out.printf("%6d  %s%n", v, k));
        if (firstFailure != null) System.out.println("  first failure: " + firstFailure);
    }

    static String shortMessage(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String m = root.getClass().getSimpleName() + ": " + root.getMessage();
        return m.length() > 200 ? m.substring(0, 200) : m;
    }
}
