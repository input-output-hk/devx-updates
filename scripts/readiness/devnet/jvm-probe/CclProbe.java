// Decode raw transactions from the Dijkstra devnet with cardano-client-lib the way Java wallets and backends do:
// Transaction.deserialize, then a re-encode compared byte for byte, and the transaction id.
//
//   java -cp CLASSPATH CclProbe < LINES   "name hex" per line
import com.bloxbean.cardano.client.transaction.spec.Transaction;
import com.bloxbean.cardano.client.transaction.util.TransactionUtil;
import com.bloxbean.cardano.client.util.HexUtil;

import java.io.BufferedReader;
import java.io.InputStreamReader;

public class CclProbe {
    public static void main(String[] args) throws Exception {
        Package p = Transaction.class.getPackage();
        System.out.println("cardano-client-lib " + (p.getImplementationVersion() != null ? p.getImplementationVersion() : args.length > 0 ? args[0] : "unknown"));
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        for (String line; (line = in.readLine()) != null; ) {
            String[] parts = line.trim().split(" ");
            if (parts.length < 2) continue;
            String name = parts[0], hex = parts[1], result;
            try {
                Transaction tx = Transaction.deserialize(HexUtil.decodeHexString(hex));
                String again = HexUtil.encodeHexString(tx.serialize());
                result = "decoded, " + tx.getBody().getInputs().size() + " inputs, " + tx.getBody().getOutputs().size()
                        + " outputs, id " + TransactionUtil.getTxHash(tx).substring(0, 16) + "…, "
                        + (again.equals(hex) ? "re-encode exact" : "re-encode differs (head " + again.substring(0, 4) + ")");
            } catch (Throwable e) {
                result = "error: " + short_(e);
            }
            System.out.printf("%-36s head %s: %s%n", name, hex.substring(0, 4), result);
        }
    }

    static String short_(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String m = root.getClass().getSimpleName() + ": " + root.getMessage();
        return m.length() > 160 ? m.substring(0, 160) : m;
    }
}
