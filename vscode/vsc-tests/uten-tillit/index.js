// Mocha-oppstart for kjøringen uten tillit (--extensionTestsPath peker hit).
// Startes av scripts/kjor-uten-tillit.mjs, ikke av @vscode/test-cli.
const path = require("node:path");
// mocha 12 er ESM; require(esm) gir et navnerom i utvidelsesverten.
const mochaModul = require("mocha");
const Mocha = mochaModul.default ?? mochaModul.Mocha ?? mochaModul;

exports.run = () =>
  new Promise((resolve, reject) => {
    const mocha = new Mocha({ ui: "tdd", timeout: 20000 });
    mocha.addFile(path.join(__dirname, "aktivering-uten-tillit.vsctest.js"));
    mocha.addFile(path.join(__dirname, "oppsett-uten-tillit.vsctest.js"));
    mocha.addFile(path.join(__dirname, "oktvindu-uten-tillit.vsctest.js"));
    mocha.run((failures) => (failures ? reject(new Error(`${failures} test(er) feilet`)) : resolve()));
  });
