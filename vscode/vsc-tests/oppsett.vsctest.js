// Røyktester for oppsett og sletting av token (D3), med falsk Canvas.
// VS Code startes med --use-inmemory-secretstorage (se .vscode-test.mjs), så
// testene rører aldri lærerens nøkkelring.
const assert = require("node:assert/strict");
const vscode = require("vscode");
const { CANVAS, GYLDIG_TOKEN, medFalskCanvas } = require("./hjelpere/falsk-canvas.js");

const tilstand = () => vscode.commands.executeCommand("canvasClone._tilstand");

suite("oppsett og token", () => {
  suiteSetup(async () => {
    await vscode.extensions.getExtension("krola1.canvas-clone-vscode").activate();
    await vscode.commands.executeCommand("canvasClone.deleteToken");
  });

  test("kommandoene finnes, og utvidelsen har ingen innstillinger (T8)", async () => {
    const alle = await vscode.commands.getCommands(true);
    for (const k of ["canvasClone.setup", "canvasClone.deleteToken"]) assert.ok(alle.includes(k), k);
    const pkg = vscode.extensions.getExtension("krola1.canvas-clone-vscode").packageJSON;
    assert.equal(pkg.contributes.configuration, undefined);
  });

  test("avbrutt ved URL lagrer ingenting og kaller ikke Canvas", async () => {
    const r = await medFalskCanvas([undefined], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "avbrutt" });
    assert.equal(r.fetch.length, 0);
    assert.deepEqual(await tilstand(), { canvasUrl: undefined, token: "ikke_satt_opp" });
  });

  test("URL-feltet godtar bare https, tokenfeltet er skjult", async () => {
    const r = await medFalskCanvas([`${CANVAS}/`, undefined], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "avbrutt" });
    const [urlBoks, tokenBoks] = r.inputBoxer;
    assert.notEqual(urlBoks.validateInput("http://canvas.test.invalid"), null);
    assert.notEqual(urlBoks.validateInput("canvas.test.invalid"), null);
    assert.equal(urlBoks.validateInput(CANVAS), null);
    assert.equal(tokenBoks.password, true);
    assert.notEqual(tokenBoks.validateInput("   "), null);
  });

  test("ugyldig token: ingenting lagres, meldingen viser ikke tokenet", async () => {
    const feilToken = "falskt-ugyldig-token";
    const r = await medFalskCanvas([CANVAS, feilToken], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "feil", reason: "invalid_token" });
    assert.equal(r.meldinger.length, 1);
    assert.equal(r.meldinger[0].type, "showErrorMessage");
    assert.ok(!r.meldinger[0].tekst.includes(feilToken));
    assert.deepEqual(await tilstand(), { canvasUrl: undefined, token: "ikke_satt_opp" });
  });

  test("nettverksfeil (feil vert): ingenting lagres", async () => {
    const r = await medFalskCanvas(["https://annen-vert.test.invalid", GYLDIG_TOKEN], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "feil", reason: "network" });
    assert.ok(!r.meldinger[0].tekst.includes(GYLDIG_TOKEN));
    assert.deepEqual(await tilstand(), { canvasUrl: undefined, token: "ikke_satt_opp" });
  });

  test("gyldig token: whoAmI mot Canvas-URL-en, så lagres URL og token", async () => {
    const r = await medFalskCanvas([`${CANVAS}/`, ` ${GYLDIG_TOKEN} `], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "ok" });
    // T15: ett kall, bare til Canvas-URL-en, med tokenet som Bearer.
    assert.deepEqual(r.fetch, [{ origin: CANVAS, path: "/api/v1/users/self", auth: `Bearer ${GYLDIG_TOKEN}` }]);
    assert.equal(r.meldinger[0].type, "showInformationMessage");
    assert.ok(!r.meldinger[0].tekst.includes(GYLDIG_TOKEN));
    assert.deepEqual(await tilstand(), { canvasUrl: CANVAS, token: "ok" });
  });

  test("nytt oppsett foreslår lagret URL; feil token lar det gamle oppsettet stå", async () => {
    const r = await medFalskCanvas([CANVAS, "falskt-ugyldig-token"], "canvasClone.setup");
    assert.equal(r.inputBoxer[0].value, CANVAS);
    assert.equal(r.res.status, "feil");
    assert.deepEqual(await tilstand(), { canvasUrl: CANVAS, token: "ok" });
  });

  test("slettekommandoen fjerner token og URL (T13)", async () => {
    const r = await medFalskCanvas([], "canvasClone.deleteToken");
    assert.deepEqual(r.res, { status: "slettet" });
    assert.equal(r.fetch.length, 0);
    assert.deepEqual(await tilstand(), { canvasUrl: undefined, token: "ikke_satt_opp" });
  });
});
