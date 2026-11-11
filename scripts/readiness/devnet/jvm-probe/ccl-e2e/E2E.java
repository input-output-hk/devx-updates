// End-to-end: build, sign and submit transactions with cardano-client-lib's QuickTx against a local
// Dijkstra (protocol version 12) devnet. UTxOs and protocol parameters come from cardano-cli; raw CBOR is
// submitted to cardano-submit-api, the path Blockfrost's /tx/submit uses.
//
//   java -cp CP E2E <version-label> <workdir> <case>...
// cases: init | pay | meta | reg-legacy | reg-new | lock-v3 | spend-v3 | dereg-legacy | dereg-new
import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.address.Address;
import com.bloxbean.cardano.client.api.ProtocolParamsSupplier;
import com.bloxbean.cardano.client.api.TransactionProcessor;
import com.bloxbean.cardano.client.api.UtxoSupplier;
import com.bloxbean.cardano.client.api.common.OrderEnum;
import com.bloxbean.cardano.client.api.model.*;
import com.bloxbean.cardano.client.address.AddressProvider;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.function.helper.SignerProviders;
import com.bloxbean.cardano.client.metadata.cbor.CBORMetadata;
import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.quicktx.QuickTxBuilder;
import com.bloxbean.cardano.client.quicktx.ScriptTx;
import com.bloxbean.cardano.client.quicktx.Tx;
import com.bloxbean.cardano.client.transaction.spec.Transaction;
import com.bloxbean.cardano.client.transaction.spec.cert.*;
import com.bloxbean.cardano.client.util.HexUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

public class E2E {
    static final ObjectMapper M = new ObjectMapper();
    static final String CLI = "/tmp/dj-ccl/node/bin/cardano-cli";
    static final String SOCK = "/tmp/dj-ccl/env/socket/node1/sock";
    static final String SUBMIT = "http://127.0.0.1:8191/api/submit/tx";
    static final PlutusV3Script V3 = PlutusV3Script.builder().type("PlutusScriptV3").cborHex("46450101002499").build();
    static String label;
    static Path work;

    public static void main(String[] args) throws Exception {
        label = args[0];
        work = Path.of(args[1]);
        Files.createDirectories(work);
        Account acc = account();
        String addr = acc.baseAddress();
        System.out.println("# cardano-client-lib " + label + "  account " + addr + "  stake " + acc.stakeAddress());
        QuickTxBuilder qtx = new QuickTxBuilder(new CliUtxos(), E2E::params, new Submitter());
        for (int i = 2; i < args.length; i++) {
            String c = args[i];
            try {
                switch (c) {
                    case "init" -> {}
                    case "pay" -> run(c, qtx.compose(new Tx().payToAddress(addr, Amount.ada(3)).from(addr))
                            .withSigner(SignerProviders.signerFrom(acc)));
                    case "meta" -> run(c, qtx.compose(new Tx().payToAddress(addr, Amount.ada(3))
                                    .attachMetadata(new CBORMetadata()
                                            .put(BigInteger.valueOf(674), "ccl " + label))
                                    .from(addr))
                            .withSigner(SignerProviders.signerFrom(acc)));
                    case "reg-legacy" -> run(c, qtx.compose(new Tx().registerStakeAddress(acc.stakeAddress()).from(addr))
                            .withSigner(SignerProviders.signerFrom(acc)));
                    case "reg-new" -> run(c, qtx.compose(new Tx().registerStakeAddress(acc.stakeAddress()).from(addr))
                            .preBalanceTx((ctx, txn) -> swapCerts(txn, ctx.getProtocolParams()))
                            .withSigner(SignerProviders.signerFrom(acc))
                            .withSigner(SignerProviders.stakeKeySignerFrom(acc)));
                    case "dereg-legacy" -> run(c, qtx.compose(new Tx().deregisterStakeAddress(acc.stakeAddress()).from(addr))
                            .withSigner(SignerProviders.signerFrom(acc))
                            .withSigner(SignerProviders.stakeKeySignerFrom(acc)));
                    case "dereg-new" -> run(c, qtx.compose(new Tx().deregisterStakeAddress(acc.stakeAddress()).from(addr))
                            .preBalanceTx((ctx, txn) -> swapCerts(txn, ctx.getProtocolParams()))
                            .withSigner(SignerProviders.signerFrom(acc))
                            .withSigner(SignerProviders.stakeKeySignerFrom(acc)));
                    case "lock-v3" -> {
                        String sa = AddressProvider.getEntAddress(V3, Networks.testnet()).toBech32();
                        run(c, qtx.compose(new Tx().payToContract(sa, Amount.ada(10), BigIntPlutusData.of(42)).from(addr))
                                .withSigner(SignerProviders.signerFrom(acc)));
                    }
                    case "spend-v3" -> {
                        String sa = AddressProvider.getEntAddress(V3, Networks.testnet()).toBech32();
                        List<Utxo> locked = new CliUtxos().getPage(sa, 100, 0, OrderEnum.asc);
                        if (locked.isEmpty()) throw new IllegalStateException("nothing locked at " + sa);
                        Utxo u = locked.get(0);
                        ScriptTx st = new ScriptTx().collectFrom(u, BigIntPlutusData.of(1))
                                .payToAddress(addr, Amount.ada(5)).attachSpendingValidator(V3);
                        run(c, qtx.compose(st).feePayer(addr).collateralPayer(addr)
                                .withSigner(SignerProviders.signerFrom(acc)));
                    }
                    case "dup-signer" -> run(c, qtx.compose(new Tx().payToAddress(addr, Amount.ada(3)).from(addr))
                            .withSigner(SignerProviders.signerFrom(acc))
                            .withSigner(SignerProviders.signerFrom(acc)));
                    case "lock-hash2" -> {
                        String sa = AddressProvider.getEntAddress(V3, Networks.testnet()).toBech32();
                        String dh = BigIntPlutusData.of(7).getDatumHash();
                        run(c, qtx.compose(new Tx().payToContract(sa, Amount.ada(10), dh)
                                        .payToContract(sa, Amount.ada(11), dh).from(addr))
                                .withSigner(SignerProviders.signerFrom(acc)));
                    }
                    case "spend-hash2" -> {
                        String sa = AddressProvider.getEntAddress(V3, Networks.testnet()).toBech32();
                        String dh = BigIntPlutusData.of(7).getDatumHash();
                        List<Utxo> locked = new CliUtxos().getPage(sa, 100, 0, OrderEnum.asc).stream()
                                .filter(u -> dh.equals(u.getDataHash())).toList();
                        if (locked.size() < 2) throw new IllegalStateException("need two outputs with datum hash, have " + locked.size());
                        ScriptTx st = new ScriptTx()
                                .collectFrom(locked.get(0), BigIntPlutusData.of(1), BigIntPlutusData.of(7))
                                .collectFrom(locked.get(1), BigIntPlutusData.of(1), BigIntPlutusData.of(7))
                                .payToAddress(addr, Amount.ada(5)).attachSpendingValidator(V3);
                        Transaction t = qtx.compose(st).feePayer(addr).collateralPayer(addr)
                                .withSigner(SignerProviders.signerFrom(acc)).buildAndSign();
                        System.out.println("  datums in witness set: " + t.getWitnessSet().getPlutusDataList().size());
                        run(c, qtx.compose(st).feePayer(addr).collateralPayer(addr)
                                .withSigner(SignerProviders.signerFrom(acc)));
                    }
                    default -> System.out.println(c + ": unknown case");
                }
            } catch (Throwable e) {
                System.out.printf("%-14s BUILD-ERROR %s%n", c, root(e));
            }
        }
    }

    // Replace legacy stake (de)registration (cert types 0 and 1) with Conway's deposit-carrying certificates (7 and 8).
    static void swapCerts(Transaction txn, ProtocolParams pp) {
        BigInteger dep = new BigInteger(pp.getKeyDeposit());
        List<Certificate> certs = txn.getBody().getCerts();
        for (int i = 0; i < certs.size(); i++) {
            if (certs.get(i) instanceof StakeRegistration r) certs.set(i, new RegCert(r.getStakeCredential(), dep));
            else if (certs.get(i) instanceof StakeDeregistration d) certs.set(i, new UnregCert(d.getStakeCredential(), dep));
        }
    }

    static void run(String name, QuickTxBuilder.TxContext ctx) throws Exception {
        Transaction tx = ctx.buildAndSign();
        byte[] cbor = tx.serialize();
        String hex = HexUtil.encodeHexString(cbor);
        Files.writeString(work.resolve(label + "-" + name + ".hex"), hex + "\n");
        String certs = tx.getBody().getCerts() == null ? "-" : tx.getBody().getCerts().stream()
                .map(x -> x.getClass().getSimpleName()).reduce((a, b) -> a + "," + b).orElse("-");
        certs += " vkeys " + (tx.getWitnessSet().getVkeyWitnesses() == null ? 0 : tx.getWitnessSet().getVkeyWitnesses().size());
        String r = submit(cbor);
        boolean ok = r.startsWith("OK");
        if (ok) waitFor(r.substring(3).replace("\"", ""));
        System.out.printf("%-14s head %s certs %-22s %s%n", name, hex.substring(0, 4), certs, r);
    }

    static String submit(byte[] cbor) throws Exception {
        HttpResponse<String> res = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(SUBMIT))
                .header("Content-Type", "application/cbor").POST(HttpRequest.BodyPublishers.ofByteArray(cbor)).build(),
                HttpResponse.BodyHandlers.ofString());
        String b = res.body().replaceAll("\\s+", " ");
        return (res.statusCode() == 202 ? "OK " : "REJECTED(" + res.statusCode() + ") ") + (b.length() > 700 ? b.substring(0, 700) + "…" : b);
    }

    static void waitFor(String txid) throws Exception {
        for (int i = 0; i < 60; i++) {
            if (!cli("query", "utxo", "--tx-in", txid + "#0", "--output-json").path(txid + "#0").isMissingNode()) return;
            Thread.sleep(1000);
        }
        System.out.println("  (not confirmed after 60 s: " + txid + ")");
    }

    static Account account() throws Exception {
        Path f = work.getParent().resolve("mnemonic.txt");
        if (Files.exists(f)) return new Account(Networks.testnet(), Files.readString(f).trim());
        Account a = new Account(Networks.testnet());
        Files.writeString(f, a.mnemonic());
        return a;
    }

    static JsonNode cli(String... a) {
        try {
            List<String> cmd = new ArrayList<>(List.of(CLI, "dijkstra"));
            cmd.addAll(List.of(a));
            cmd.addAll(List.of("--testnet-magic", "42", "--socket-path", SOCK));
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            String out = new String(p.getInputStream().readAllBytes());
            if (p.waitFor() != 0) throw new RuntimeException("cardano-cli: " + out);
            return M.readTree(out);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    static ProtocolParams params() {
        JsonNode j = cli("query", "protocol-parameters");
        ProtocolParams p = new ProtocolParams();
        p.setMinFeeA(j.get("txFeePerByte").asInt());
        p.setMinFeeB(j.get("txFeeFixed").asInt());
        p.setMaxBlockSize(j.get("maxBlockBodySize").asInt());
        p.setMaxTxSize(j.get("maxTxSize").asInt());
        p.setMaxBlockHeaderSize(j.get("maxBlockHeaderSize").asInt());
        p.setKeyDeposit(j.get("stakeAddressDeposit").asText());
        p.setPoolDeposit(j.get("stakePoolDeposit").asText());
        p.setEMax(j.get("poolRetireMaxEpoch").asInt());
        p.setNOpt(j.get("stakePoolTargetNum").asInt());
        p.setProtocolMajorVer(j.get("protocolVersion").get("major").asInt());
        p.setProtocolMinorVer(j.get("protocolVersion").get("minor").asInt());
        p.setMinPoolCost(j.get("minPoolCost").asText());
        p.setPriceMem(new BigDecimal(j.get("executionUnitPrices").get("priceMemory").asText()));
        p.setPriceStep(new BigDecimal(j.get("executionUnitPrices").get("priceSteps").asText()));
        p.setMaxTxExMem(j.get("maxTxExecutionUnits").get("memory").asText());
        p.setMaxTxExSteps(j.get("maxTxExecutionUnits").get("steps").asText());
        p.setMaxBlockExMem(j.get("maxBlockExecutionUnits").get("memory").asText());
        p.setMaxBlockExSteps(j.get("maxBlockExecutionUnits").get("steps").asText());
        p.setMaxValSize(j.get("maxValueSize").asText());
        p.setCollateralPercent(new BigDecimal(j.get("collateralPercentage").asText()));
        p.setMaxCollateralInputs(j.get("maxCollateralInputs").asInt());
        p.setCoinsPerUtxoSize(j.get("utxoCostPerByte").asText());
        p.setDrepDeposit(new BigInteger(j.get("dRepDeposit").asText()));
        p.setGovActionDeposit(new BigInteger(j.get("govActionDeposit").asText()));
        p.setMinFeeRefScriptCostPerByte(new BigDecimal(j.get("minFeeRefScriptCostPerByte").asText()));
        LinkedHashMap<String, List<Long>> raw = new LinkedHashMap<>();
        j.get("costModels").fields().forEachRemaining(e -> {
            List<Long> l = new ArrayList<>();
            e.getValue().forEach(n -> l.add(n.asLong()));
            raw.put(e.getKey(), l);
        });
        p.setCostModelsRaw(raw);
        return p;
    }

    static class CliUtxos implements UtxoSupplier {
        public List<Utxo> getPage(String address, Integer n, Integer page, OrderEnum order) {
            if (page != null && page > 0) return List.of();
            return toUtxos(cli("query", "utxo", "--address", address, "--output-json"));
        }

        public Optional<Utxo> getTxOutput(String txHash, int ix) {
            return toUtxos(cli("query", "utxo", "--tx-in", txHash + "#" + ix, "--output-json")).stream().findFirst();
        }

        static List<Utxo> toUtxos(JsonNode j) {
            List<Utxo> out = new ArrayList<>();
            j.fields().forEachRemaining(e -> {
                String[] k = e.getKey().split("#");
                JsonNode v = e.getValue();
                List<Amount> amounts = new ArrayList<>();
                v.get("value").fields().forEachRemaining(a -> {
                    if (a.getKey().equals("lovelace")) amounts.add(Amount.lovelace(a.getValue().bigIntegerValue()));
                    else a.getValue().fields().forEachRemaining(t ->
                            amounts.add(new Amount(a.getKey() + t.getKey(), t.getValue().bigIntegerValue())));
                });
                Utxo u = new Utxo();
                u.setTxHash(k[0]);
                u.setOutputIndex(Integer.parseInt(k[1]));
                u.setAddress(v.get("address").asText());
                u.setAmount(amounts);
                if (v.hasNonNull("inlineDatumRaw")) u.setInlineDatum(v.get("inlineDatumRaw").asText());
                if (v.hasNonNull("inlineDatumhash")) u.setDataHash(v.get("inlineDatumhash").asText());
                else if (v.hasNonNull("datumhash")) u.setDataHash(v.get("datumhash").asText());
                out.add(u);
            });
            return out;
        }
    }

    // Submits through cardano-submit-api. Evaluation returns fixed, generous budgets: the scripts used here are
    // always-succeeds validators, so only the declared budget matters to the ledger.
    static class Submitter implements TransactionProcessor {
        public Result<String> submitTransaction(byte[] cbor) {
            throw new UnsupportedOperationException("run() submits directly");
        }

        public Result<List<EvaluationResult>> evaluateTx(byte[] cbor, Set<Utxo> inputs) {
            try {
                Transaction tx = Transaction.deserialize(cbor);
                List<EvaluationResult> r = new ArrayList<>();
                if (tx.getWitnessSet().getRedeemers() != null)
                    for (Redeemer rd : tx.getWitnessSet().getRedeemers())
                        r.add(new EvaluationResult(rd.getTag(), rd.getIndex().intValue(),
                                new ExUnits(BigInteger.valueOf(2_000_000), BigInteger.valueOf(800_000_000))));
                return Result.<List<EvaluationResult>>success("ok").withValue(r);
            } catch (Exception e) {
                return Result.<List<EvaluationResult>>error(e.toString());
            }
        }
    }

    static String root(Throwable e) {
        while (e.getCause() != null && e.getCause() != e) e = e.getCause();
        String m = e.getClass().getSimpleName() + ": " + e.getMessage();
        return m.length() > 300 ? m.substring(0, 300) : m;
    }
}
