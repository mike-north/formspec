const api = require("./dist/index.cjs");
const plugin = api.init;

module.exports = Object.assign(plugin, api);
