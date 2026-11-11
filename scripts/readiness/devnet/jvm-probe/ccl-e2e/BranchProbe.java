// cardano-client-lib branch feat/ledger-cbor (ADR 0003 M7a/M7c, ADR 0004 W-M1) against the Dijkstra devnet.
//   decode <labeled> <ids.json>   read the devnet corpus era-less and as Dijkstra; compare ids and fields
//   build <workdir> <case>...     build Dijkstra transactions with the models, sign, submit through submit-api
// Build cases: pay | pay-modelsign | dd | dd-modelsign | guard | v4ref | lock-v4 | spend-v4 | sub
import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.address.AddressProvider;
import com.bloxbean.cardano.client.address.Credential;
import com.bloxbean.cardano.client.api.common.OrderEnum;
import com.bloxbean.cardano.client.api.model.ProtocolParams;
import com.bloxbean.cardano.client.api.model.Utxo;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.crypto.Blake2bUtil;
import com.bloxbean.cardano.client.crypto.config.CryptoConfiguration;
import com.bloxbean.cardano.client.transaction.raw.RawTx;
import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.plutus.util.ScriptDataHashGenerator;
import com.bloxbean.cardano.client.spec.Era;
import com.bloxbean.cardano.client.transaction.TransactionSigner;
import com.bloxbean.cardano.client.transaction.spec.*;
import com.bloxbean.cardano.client.transaction.util.TransactionUtil;
import com.bloxbean.cardano.client.util.HexUtil;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

public class BranchProbe {
    static final PlutusV4Script V4 = PlutusV4Script.builder().type("PlutusScriptV4").cborHex("46450101002499").build();
    static final BigInteger FEE = BigInteger.valueOf(400_000);

    public static void main(String[] a) throws Exception {
        if (a[0].equals("decode")) decode(Path.of(a[1]), Path.of(a[2]));
        else build(a);
    }

    static void decode(Path labeled, Path idsFile) throws Exception {
        JsonNode ids = E2E.M.readTree(idsFile.toFile());
        System.out.println("# branch feat/ledger-cbor: era-less deserialize vs deserialize(bytes, Era.Dijkstra)");
        for (String line : Files.readAllLines(labeled)) {
            String[] p = line.trim().split(" ");
            if (p.length < 2) continue;
            String name = p[0], hex = p[1], chain = ids.path(name).asText("?");
            byte[] b = HexUtil.decodeHexString(hex);
            StringBuilder r = new StringBuilder();
            try {
                r.append("raw id ").append(eq(HexUtil.encodeHexString(RawTx.of(b).txId()), chain));
            } catch (Throwable e) { r.append("raw: ").append(E2E.root(e)); }
            for (Era era : new Era[]{null, Era.Dijkstra}) {
                r.append(" | ").append(era == null ? "era-less: " : "Dijkstra: ");
                try {
                    Transaction t = era == null ? Transaction.deserialize(b) : Transaction.deserialize(b, era);
                    TransactionBody bd = t.getBody();
                    r.append("model id ").append(eq(TransactionUtil.getTxHash(t), chain));
                    String again = HexUtil.encodeHexString(t.serialize());
                    r.append(", re-encode ").append(again.equals(hex) ? "exact" : "differs(" + again.substring(0, 4) + ")");
                    List<String> f = new ArrayList<>();
                    if (bd.getDirectDeposits() != null) f.add("directDeposits=" + bd.getDirectDeposits().size());
                    if (bd.getSubTransactions() != null) f.add("subTxs=" + bd.getSubTransactions().size());
                    if (bd.getGuards() != null) f.add("guards=" + bd.getGuards().size());
                    for (TransactionOutput o : bd.getOutputs())
                        if (o.getScriptRef() != null) f.add("scriptRef=" + HexUtil.encodeHexString(o.getScriptRef()).substring(0, 4));
                    if (!f.isEmpty()) r.append(", ").append(String.join(",", f));
                } catch (Throwable e) { r.append("error ").append(E2E.root(e)); }
            }
            System.out.printf("%-44s %s%n", name, r);
        }
    }

    static String eq(String id, String chain) {
        return chain.equals("?") ? id.substring(0, 12) + "…" : id.equals(chain) ? "= chain" : "≠ chain (" + id.substring(0, 12) + "…)";
    }

    static Account acc;
    static String addr;

    static void build(String[] a) throws Exception {
        E2E.label = "branch";
        E2E.work = Path.of(a[1]);
        Files.createDirectories(E2E.work);
        acc = E2E.account();
        addr = acc.baseAddress();
        System.out.println("# branch feat/ledger-cbor model build, account " + addr);
        for (int i = 2; i < a.length; i++) {
            String c = a[i];
            try {
                switch (c) {
                    case "pay" -> submit(c, simple(b -> {}), false);
                    case "pay-modelsign" -> submit(c, simple(b -> {}), true);
                    case "dd" -> submit(c, simple(b -> b.setDirectDeposits(List.of(new Withdrawal(acc.stakeAddress(), ada(5))))), false);
                    case "dd-modelsign" -> submit(c, simple(b -> b.setDirectDeposits(List.of(new Withdrawal(acc.stakeAddress(), ada(5))))), true);
                    case "guard" -> submit(c, simple(b -> b.setGuards(List.of(Credential.fromKey(acc.hdKeyPair().getPublicKey().getKeyHash())))), false);
                    case "guard-fail" -> submit(c, simple(b -> b.setGuards(List.of(Credential.fromKey(acc.stakeHdKeyPair().getPublicKey().getKeyHash())))), false);
                    case "v4ref" ->submit(c, simple(b -> {
                        TransactionOutput o = b.getOutputs().get(0);
                        o.setScriptRef(V4.scriptRefBytes());
                    }), false);
                    case "lock-v4" -> submit(c, simple(b -> {
                        String sa = AddressProvider.getEntAddress(V4, Networks.testnet()).toBech32();
                        b.getOutputs().add(TransactionOutput.builder().address(sa)
                                .value(Value.builder().coin(ada(10)).build()).inlineDatum(BigIntPlutusData.of(42)).build());
                        TransactionOutput change = b.getOutputs().get(0);
                        change.getValue().setCoin(change.getValue().getCoin().subtract(ada(10)));
                    }), false);
                    case "abi-ok", "abi-fail" -> {
                        long lower = c.equals("abi-ok") ? 1 : 100;
                        Transaction t = simple(b -> b.setAccountBalanceIntervals(List.of(AccountBalanceInterval.builder()
                                .rewardAddress(acc.stakeAddress()).inclusiveLower(ada(lower)).build())));
                        byte[] unsigned = t.serialize(Era.Dijkstra);
                        byte[] signed = TransactionSigner.INSTANCE.sign(unsigned, acc.hdKeyPair());
                        signed = TransactionSigner.INSTANCE.sign(signed, acc.stakeHdKeyPair());
                        report(c, signed, unsigned);
                    }
                    case "spend-v4" -> spendV4();
                    case "sub" -> sub();
                    default -> System.out.println(c + ": unknown");
                }
            } catch (Throwable e) {
                System.out.printf("%-14s BUILD-ERROR %s%n", c, E2E.root(e));
            }
        }
    }

    interface BodyEdit { void apply(TransactionBody b) throws Exception; }

    static BigInteger ada(long n) { return BigInteger.valueOf(n * 1_000_000); }

    static List<Utxo> mine() {
        List<Utxo> l = new ArrayList<>(new E2E.CliUtxos().getPage(addr, 100, 0, OrderEnum.asc));
        l.removeIf(u -> u.getAmount().size() != 1 || u.getAmount().get(0).getQuantity().compareTo(ada(50)) < 0);
        return l;
    }

    static Transaction simple(BodyEdit edit) throws Exception {
        Utxo u = mine().get(0);
        BigInteger in = u.getAmount().get(0).getQuantity();
        TransactionBody b = TransactionBody.builder()
                .inputs(new ArrayList<>(List.of(new TransactionInput(u.getTxHash(), u.getOutputIndex()))))
                .outputs(new ArrayList<>(List.of(TransactionOutput.builder().address(addr)
                        .value(Value.builder().coin(in.subtract(FEE)).build()).build())))
                .fee(FEE).build();
        edit.apply(b);
        if (b.getDirectDeposits() != null) {
            TransactionOutput o = b.getOutputs().get(0);
            for (Withdrawal w : b.getDirectDeposits()) o.getValue().setCoin(o.getValue().getCoin().subtract(w.getCoin()));
        }
        Transaction t = new Transaction();
        t.setBody(b);
        t.setWitnessSet(new TransactionWitnessSet());
        t.setEra(Era.Dijkstra);
        return t;
    }

    static void submit(String name, Transaction t, boolean modelSign) throws Exception {
        byte[] unsigned = t.serialize(Era.Dijkstra);
        byte[] cbor;
        if (modelSign) {
            Transaction s = acc.sign(t);
            cbor = s.serialize(Era.Dijkstra);
        } else {
            cbor = TransactionSigner.INSTANCE.sign(unsigned, acc.hdKeyPair());
        }
        report(name, cbor, unsigned);
    }

    static void report(String name, byte[] cbor, byte[] unsigned) throws Exception {
        String hex = HexUtil.encodeHexString(cbor);
        Files.writeString(E2E.work.resolve("branch-" + name + ".hex"), hex + "\n");
        RawTx raw = RawTx.of(cbor);
        String bodySame = Arrays.equals(raw.body().bytes(), RawTx.of(unsigned).body().bytes()) ? "body kept" : "BODY CHANGED BY SIGNING";
        String r = E2E.submit(cbor);
        if (r.startsWith("OK")) E2E.waitFor(r.substring(3).replace("\"", ""));
        System.out.printf("%-14s head %s, %s, %s%n", name, hex.substring(0, 4), bodySame, r);
    }

    // Spend the output lock-v4 made: Plutus V4 witness (key 8), map redeemer, V4 language view in the script data hash.
    static void spendV4() throws Exception {
        String sa = AddressProvider.getEntAddress(V4, Networks.testnet()).toBech32();
        Utxo locked = new E2E.CliUtxos().getPage(sa, 100, 0, OrderEnum.asc).get(0);
        Utxo fund = mine().get(0);
        BigInteger total = locked.getAmount().get(0).getQuantity().add(fund.getAmount().get(0).getQuantity());
        ProtocolParams pp = E2E.params();
        Redeemer rd = Redeemer.builder().tag(RedeemerTag.Spend).data(BigIntPlutusData.of(1)).index(BigInteger.ZERO)
                .exUnits(new ExUnits(BigInteger.valueOf(2_000_000), BigInteger.valueOf(800_000_000))).build();
        List<TransactionInput> ins = new ArrayList<>(List.of(new TransactionInput(locked.getTxHash(), locked.getOutputIndex()),
                new TransactionInput(fund.getTxHash(), fund.getOutputIndex())));
        ins.sort(Comparator.comparing(TransactionInput::getTransactionId).thenComparing(TransactionInput::getIndex));
        rd.setIndex(BigInteger.valueOf(ins.indexOf(new TransactionInput(locked.getTxHash(), locked.getOutputIndex()))));
        List<Long> v4 = pp.getCostModelsRaw().get("PlutusV4");
        CostMdls cm = new CostMdls();
        cm.add(new CostModel(Language.PLUTUS_V4, v4.stream().mapToLong(Long::longValue).toArray()));
        TransactionBody b = TransactionBody.builder().inputs(ins)
                .outputs(new ArrayList<>(List.of(TransactionOutput.builder().address(addr)
                        .value(Value.builder().coin(total.subtract(ada(2))).build()).build())))
                .fee(ada(2))
                .collateral(List.of(new TransactionInput(fund.getTxHash(), fund.getOutputIndex())))
                .scriptDataHash(ScriptDataHashGenerator.generate(Era.Dijkstra, List.of(rd), List.of(), cm))
                .build();
        TransactionWitnessSet w = new TransactionWitnessSet();
        w.setRedeemers(List.of(rd));
        w.setPlutusV4Scripts(List.of(V4));
        Transaction t = new Transaction();
        t.setBody(b); t.setWitnessSet(w); t.setEra(Era.Dijkstra);
        byte[] unsigned = t.serialize(Era.Dijkstra);
        report("spend-v4", TransactionSigner.INSTANCE.sign(unsigned, acc.hdKeyPair()), unsigned);
    }

    // A top-level transaction carrying one sub-transaction. Each spends its own input; the sub-transaction has no fee
    // and is signed over its own body hash; the top-level body (which contains the signed sub-transaction) is signed last.
    static void sub() throws Exception {
        List<Utxo> us = mine();
        Utxo top = us.get(0), inner = us.get(1);
        BigInteger innerAmt = inner.getAmount().get(0).getQuantity();
        TransactionBody sb = TransactionBody.builder()
                .inputs(new ArrayList<>(List.of(new TransactionInput(inner.getTxHash(), inner.getOutputIndex()))))
                .outputs(new ArrayList<>(List.of(TransactionOutput.builder().address(addr)
                        .value(Value.builder().coin(innerAmt).build()).build())))
                .build();
        sb.setFee(null);
        SubTransaction st = new SubTransaction();
        st.setBody(sb);
        st.setWitnessSet(new TransactionWitnessSet());
        Transaction t = simple(b -> b.setSubTransactions(List.of(st)));
        // The sub body's bytes as the transaction writes them, read back through the reader.
        byte[] probe = t.serialize(Era.Dijkstra);
        RawTx subRaw = RawTx.of(probe).body(Era.Dijkstra).subTransactions().get(0);
        byte[] subBody = subRaw.body().bytes();
        var kp = acc.hdKeyPair();
        byte[] sig = CryptoConfiguration.INSTANCE.getSigningProvider()
                .signExtended(Blake2bUtil.blake2bHash256(subBody), kp.getPrivateKey().getKeyData());
        st.getWitnessSet().setVkeyWitnesses(new ArrayList<>(List.of(new VkeyWitness(kp.getPublicKey().getKeyData(), sig))));
        System.out.println("  sub-transaction id " + HexUtil.encodeHexString(Blake2bUtil.blake2bHash256(subBody)));
        byte[] unsigned = t.serialize(Era.Dijkstra);
        report("sub", TransactionSigner.INSTANCE.sign(unsigned, kp), unsigned);
    }
}
